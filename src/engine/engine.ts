import { prisma } from "../db.js";
import { registry } from "../strategies/index.js";
import { buildContext } from "./context.js";
import { computeMetrics } from "./metrics.js";
import { emitProgress } from "./progress.js";
import type {
  Bar,
  BacktestConfig,
  Fill,
  RunBacktestInput,
  ValuationSnap,
} from "./types.js";

const DEFAULT_CONFIG: BacktestConfig = {
  commissionRate: 0.00025,
  minCommission: 5,
  slippage: 0,
};

type Order = { code: string; side: "buy" | "sell"; shares: number };

export async function runBacktest(input: RunBacktestInput): Promise<string> {
  const run =
    input.runId != null
      ? { id: input.runId }
      : await prisma.backtestRun.create({
          data: {
            strategyKey: input.strategyKey,
            params: JSON.stringify({
              params: input.params,
              config: input.config ?? {},
            }),
            codes: JSON.stringify(input.codes),
            startDate: input.startDate,
            endDate: input.endDate,
            status: "running",
          },
        });

  try {
    const meta = registry[input.strategyKey];
    if (!meta) throw new Error(`未知策略: ${input.strategyKey}`);
    if (!input.codes?.length) throw new Error("codes 不能为空");
    if (input.startDate > input.endDate) {
      throw new Error("startDate 必须 <= endDate");
    }
    if (!Number.isFinite(input.initialCash ?? 1) || (input.initialCash ?? 1) <= 0) {
      throw new Error("initialCash 必须大于 0");
    }

    const config: BacktestConfig = {
      ...DEFAULT_CONFIG,
      ...(input.config ?? {}),
    };
    const initialCash = input.initialCash ?? 1_000_000;
    const codes = [...new Set(input.codes)];

    const etfs = await prisma.etf.findMany({
      where: { code: { in: codes } },
      select: { code: true, trackIndex: true },
    });
    const trackOf = new Map<string, string>(
      etfs.map((etf) => [etf.code, etf.trackIndex]),
    );
    const trackIndexes = [
      ...new Set(etfs.map((etf) => etf.trackIndex).filter(Boolean)),
    ];

    const [klines, valuations, featureRows] = await Promise.all([
      prisma.kline.findMany({
        where: {
          code: { in: codes },
          date: { gte: input.startDate, lte: input.endDate },
        },
      }),
      prisma.valuation.findMany({
        where: {
          code: { in: trackIndexes },
          date: { gte: input.startDate, lte: input.endDate },
        },
      }),
      prisma.feature.findMany({
        where: {
          code: { in: codes },
          date: { gte: input.startDate, lte: input.endDate },
        },
      }),
    ]);

    const barsByCode = new Map<string, Bar[]>();
    const closeByCodeDate = new Map<string, number>();
    for (const row of klines) {
      if (!barsByCode.has(row.code)) barsByCode.set(row.code, []);
      barsByCode.get(row.code)!.push({
        code: row.code,
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        amount: row.amount,
        change: row.change,
        changePercent: row.changePercent,
      });
      closeByCodeDate.set(`${row.code}|${row.date}`, row.close);
    }
    for (const bars of barsByCode.values()) {
      bars.sort((a, b) => a.date - b.date);
    }

    const valuationMap = new Map<string, ValuationSnap>();
    for (const row of valuations) {
      valuationMap.set(`${row.code}|${row.type}|${row.date}`, {
        value: row.value,
        percent: row.percent,
      });
    }

    const featureMap = new Map<string, number>();
    for (const row of featureRows) {
      featureMap.set(`${row.code}|${row.name}|${row.date}`, row.value);
    }

    const dateSet = new Set<number>();
    for (const bars of barsByCode.values()) {
      for (const bar of bars) dateSet.add(bar.date);
    }
    const tradingDates = [...dateSet].sort((a, b) => a - b);
    if (!tradingDates.length) throw new Error("区间内无 K 线数据");

    const closeOf = (code: string, date: number) =>
      closeByCodeDate.get(`${code}|${date}`) ?? 0;

    let cash = initialCash;
    const positions: Record<string, number> = {};
    let boughtToday: Record<string, number> = {};
    const fills: Fill[] = [];
    const dailies: {
      date: number;
      equity: number;
      cash: number;
      positions: Record<string, number>;
    }[] = [];

    const strategy = new meta.createStrategy();
    strategy.initialize?.(input.params ?? {});

    const executeFill = (fill: Fill) => {
      fills.push(fill);
      strategy.onOrder?.(fill);
    };

    for (let index = 0; index < tradingDates.length; index++) {
      const date = tradingDates[index];
      const equityBefore =
        cash +
        codes.reduce(
          (total, code) => total + (positions[code] ?? 0) * closeOf(code, date),
          0,
        );
      const targetWeightsRef = {
        value: {} as Record<string, number>,
        set: false,
      };
      const manualOrders: Order[] = [];
      const logger = (message: string) =>
        console.log(`[backtest ${run.id} ${date}] ${message}`);
      const context = buildContext({
        date,
        codes,
        cash,
        positions,
        equity: equityBefore,
        barsByCode,
        trackOf,
        valuationMap,
        featureMap,
        targetWeightsRef,
        manualOrders,
        logger,
      });
      strategy.handleBar(context);

      const orders: Order[] = [];
      if (targetWeightsRef.set) {
        const rawWeights = Object.fromEntries(
          Object.entries(targetWeightsRef.value)
            .filter(([code, weight]) => codes.includes(code) && weight > 0)
            .map(([code, weight]) => [code, Number(weight)]),
        );
        const totalWeight = Object.values(rawWeights).reduce(
          (total, weight) => total + weight,
          0,
        );
        const normalized =
          totalWeight > 1
            ? Object.fromEntries(
                Object.entries(rawWeights).map(([code, weight]) => [
                  code,
                  weight / totalWeight,
                ]),
              )
            : rawWeights;

        for (const code of codes) {
          const price = closeOf(code, date);
          if (price <= 0) continue;
          const targetShares =
            Math.floor(((equityBefore * (normalized[code] ?? 0)) / price) / 100) *
            100;
          const difference = targetShares - (positions[code] ?? 0);
          if (difference > 0) {
            orders.push({ code, side: "buy", shares: difference });
          } else if (difference < 0) {
            orders.push({ code, side: "sell", shares: -difference });
          }
        }
      } else if (manualOrders.length) {
        orders.push(...manualOrders);
      }

      for (const order of orders.filter((item) => item.side === "sell")) {
        const sellable = Math.max(
          0,
          (positions[order.code] ?? 0) - (boughtToday[order.code] ?? 0),
        );
        const shares =
          Math.floor(Math.min(order.shares, sellable) / 100) * 100;
        if (shares <= 0) {
          logger(`卖出裁剪 ${order.code}`);
          continue;
        }
        const price = closeOf(order.code, date) * (1 - config.slippage);
        const gross = shares * price;
        const fee = Math.max(config.minCommission, gross * config.commissionRate);
        cash += gross - fee;
        positions[order.code] -= shares;
        executeFill({
          code: order.code,
          side: "sell",
          shares,
          price,
          fee,
          date,
        });
      }

      const pricedBuys = orders
        .filter((order) => order.side === "buy")
        .map((order) => {
          const price = closeOf(order.code, date) * (1 + config.slippage);
          return { code: order.code, want: order.shares, price };
        })
        .filter((order) => order.price > 0);
      const required = pricedBuys.reduce((total, order) => {
        const gross = order.want * order.price;
        return (
          total +
          gross +
          Math.max(config.minCommission, gross * config.commissionRate)
        );
      }, 0);
      const scale = required > cash && required > 0 ? cash / required : 1;
      let available = cash;

      for (const order of pricedBuys) {
        let shares = Math.floor((order.want * scale) / 100) * 100;
        while (shares > 0) {
          const gross = shares * order.price;
          const fee = Math.max(
            config.minCommission,
            gross * config.commissionRate,
          );
          if (gross + fee <= available) {
            available -= gross + fee;
            positions[order.code] = (positions[order.code] ?? 0) + shares;
            boughtToday[order.code] = (boughtToday[order.code] ?? 0) + shares;
            executeFill({
              code: order.code,
              side: "buy",
              shares,
              price: order.price,
              fee,
              date,
            });
            break;
          }
          shares -= 100;
        }
        if (shares <= 0) logger(`买入裁剪 ${order.code}`);
      }
      cash = available;

      const equityAfter =
        cash +
        codes.reduce(
          (total, code) => total + (positions[code] ?? 0) * closeOf(code, date),
          0,
        );
      dailies.push({
        date,
        equity: equityAfter,
        cash,
        positions: { ...positions },
      });

      if (index % 10 === 0 || index === tradingDates.length - 1) {
        emitProgress(run.id, {
          type: "progress",
          date,
          pct: (index + 1) / tradingDates.length,
          equity: equityAfter,
        });
      }
      boughtToday = {};
    }

    const metrics = computeMetrics(
      dailies.map((daily) => ({ date: daily.date, equity: daily.equity })),
      fills,
      initialCash,
    );

    await prisma.$transaction([
      prisma.backtestDaily.createMany({
        data: dailies.map((daily) => ({
          runId: run.id,
          date: daily.date,
          equity: daily.equity,
          cash: daily.cash,
          positions: JSON.stringify(daily.positions),
        })),
      }),
      prisma.backtestTrade.create({
        data: { runId: run.id, trades: JSON.stringify(fills) },
      }),
      prisma.backtestRun.update({
        where: { id: run.id },
        data: {
          status: "success",
          finishedAt: new Date(),
          error: null,
          ...metrics,
        },
      }),
    ]);

    emitProgress(run.id, {
      type: "done",
      status: "success",
      totalReturn: metrics.totalReturn,
    });
    return run.id;
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    await prisma.backtestRun.updateMany({
      where: { id: run.id },
      data: { status: "failed", error: message, finishedAt: new Date() },
    });
    emitProgress(run.id, { type: "error", message });
    return run.id;
  }
}
