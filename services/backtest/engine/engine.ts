/**
 * 通用回测引擎。
 *
 * 负责时间调度、策略上下文构建、订单优先级、成交、资产核算与逐日记录。
 * 策略只返回交易意图，不能直接改动账户（对应 PRD 13.1 / 13.3）。
 *
 * 引擎本身是纯同步的：数据由调用方预先加载（见 `data.ts`），
 * 因此可以用合成数据做确定性测试。
 */

import { roundMoney } from "@/lib/math";
import type { Ymd } from "@/lib/dates";
import { executeOrder } from "@/services/backtest/broker/orders";
import { assertFeeConfig } from "@/services/backtest/broker/fees";
import { assertLotSize } from "@/services/backtest/broker/lot";
import { Portfolio } from "@/services/backtest/portfolio/portfolio";
import { computeMetrics } from "@/services/backtest/metrics/metrics";
import {
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  type MaybeSeries,
} from "@/services/backtest/indicators/indicators";
import type {
  AccountSnapshot,
  BacktestConfig,
  BacktestMetrics,
  DailyRecord,
  MarketSeries,
  OrderIntent,
  OrderRecord,
  PositionSnapshot,
  StrategyResult,
} from "@/services/backtest/types";

/** 引擎版本，写入回测记录用于复现判断。 */
export const ENGINE_VERSION = "0.2.0";

export type BarView = {
  code: string;
  date: Ymd;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
};

export type MacdView = { dif: number; dea: number; hist: number };
export type BollingerView = { upper: number; middle: number; lower: number };

export type IndicatorApi = {
  sma(period: number): number | null;
  ema(period: number): number | null;
  rsi(period?: number): number | null;
  macd(fast?: number, slow?: number, signal?: number): MacdView | null;
  bollinger(period?: number, multiplier?: number): BollingerView | null;
};

export type StrategyContext<P extends object = Record<string, unknown>> = {
  date: Ymd;
  /** 回测区间内的交易日序号，从 0 开始。 */
  index: number;
  codes: readonly string[];
  /** 当日 K 线；该 ETF 当日无数据时为 null。 */
  bar(code: string): BarView | null;
  /** 截至当日收盘的收盘价序列（含预热数据）。 */
  closes(code: string): readonly number[];
  indicators(code: string): IndicatorApi;
  position(code: string): PositionSnapshot | null;
  positions(): PositionSnapshot[];
  account: AccountSnapshot;
  params: Readonly<P>;
  log(message: string): void;
};

export type StrategyInitializeContext<P extends object = Record<string, unknown>> = {
  codes: readonly string[];
  params: Readonly<P>;
  firstDate: Ymd;
  lastDate: Ymd;
};

/**
 * 策略定义。
 *
 * `state` 由 `initialize` 创建并在每次 `onBar` 时传入；应为可序列化的普通对象
 * （对应 PRD 11.4），不得依赖闭包或跨回测共享状态。
 */
export type Strategy<
  P extends object = Record<string, unknown>,
  S = undefined,
> = {
  name: string;
  description?: string;
  params?: P;
  initialize?(ctx: StrategyInitializeContext<P>): S;
  onBar(ctx: StrategyContext<P>, state: S): StrategyResult;
};

export type RunBacktestInput<P extends object, S> = {
  strategy: Strategy<P, S>;
  config: BacktestConfig;
  /** 每个 ETF 的 K 线序列，升序，可包含回测区间之前的预热数据。 */
  series: readonly MarketSeries[];
};

export type RunBacktestResult = {
  dailyRecords: DailyRecord[];
  orders: OrderRecord[];
  metrics: BacktestMetrics;
  logs: string[];
};

function assertConfig(config: BacktestConfig): void {
  if (!Number.isFinite(config.initialCash) || config.initialCash <= 0) {
    throw new RangeError(`engine: initialCash 必须为正数，收到 ${config.initialCash}`);
  }
  if (config.codes.length === 0) {
    throw new RangeError("engine: 至少需要一个 ETF 代码");
  }
  if (config.startDate > config.endDate) {
    throw new RangeError(
      `engine: startDate(${config.startDate}) 晚于 endDate(${config.endDate})`,
    );
  }
  assertLotSize(config.trading.lotSize);
  assertFeeConfig(config.fee);
}

/**
 * 同日订单处理顺序（对应 PRD 6.2 / 13.3）。
 *
 * 1. `orderPriority` 中越靠前的 ETF 越先处理，未列出的排最后；
 * 2. 同一 ETF 先卖后买，便于用卖出所得资金买入；
 * 3. 其余保持策略返回顺序。
 */
export function sortOrderIntents(
  intents: readonly OrderIntent[],
  orderPriority: readonly string[] = [],
): OrderIntent[] {
  const rank = new Map(orderPriority.map((code, index) => [code, index]));
  return intents
    .map((intent, index) => ({ intent, index }))
    .sort((a, b) => {
      const rankA = rank.get(a.intent.code) ?? Number.MAX_SAFE_INTEGER;
      const rankB = rank.get(b.intent.code) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      const sideA = a.intent.side === "sell" ? 0 : 1;
      const sideB = b.intent.side === "sell" ? 0 : 1;
      if (sideA !== sideB) return sideA - sideB;
      return a.index - b.index;
    })
    .map((entry) => entry.intent);
}

function createIndicatorApi(
  closes: readonly number[],
  pointer: () => number,
  cache: Map<string, MaybeSeries>,
): IndicatorApi {
  const resolve = (key: string, build: () => MaybeSeries): number | null => {
    let series = cache.get(key);
    if (!series) {
      series = build();
      cache.set(key, series);
    }
    const at = pointer() - 1;
    return at >= 0 ? (series[at] ?? null) : null;
  };

  return {
    sma: (period) => resolve(`sma:${period}`, () => sma(closes, period)),
    ema: (period) => resolve(`ema:${period}`, () => ema(closes, period)),
    rsi: (period = 14) => resolve(`rsi:${period}`, () => rsi(closes, period)),
    macd: (fast = 12, slow = 26, signal = 9) => {
      const dif = resolve(`macd-dif:${fast}:${slow}`, () => macd(closes, fast, slow, signal).dif);
      const dea = resolve(`macd-dea:${fast}:${slow}:${signal}`, () => macd(closes, fast, slow, signal).dea);
      const hist = resolve(
        `macd-hist:${fast}:${slow}:${signal}`,
        () => macd(closes, fast, slow, signal).hist,
      );
      if (dif === null || dea === null || hist === null) return null;
      return { dif, dea, hist };
    },
    bollinger: (period = 20, multiplier = 2) => {
      const upper = resolve(`bb-upper:${period}:${multiplier}`, () => bollinger(closes, period, multiplier).upper);
      const middle = resolve(`bb-middle:${period}:${multiplier}`, () => bollinger(closes, period, multiplier).middle);
      const lower = resolve(`bb-lower:${period}:${multiplier}`, () => bollinger(closes, period, multiplier).lower);
      if (upper === null || middle === null || lower === null) return null;
      return { upper, middle, lower };
    },
  };
}

export function runBacktest<P extends object, S>(
  input: RunBacktestInput<P, S>,
): RunBacktestResult {
  const { strategy, config, series } = input;
  assertConfig(config);

  const params = (strategy.params ?? ({} as P)) as Readonly<P>;
  const logs: string[] = [];
  const orders: OrderRecord[] = [];
  const dailyRecords: DailyRecord[] = [];
  const portfolio = new Portfolio(config.initialCash);
  const knownCodes = new Set(config.codes);

  // 每个 ETF 一条升序序列，并维护“当前已推进到第几根”的指针。
  const timeline = config.codes.map((code) => {
    const bars = (series.find((item) => item.code === code)?.bars ?? [])
      .filter((bar) => bar.code === code)
      .slice()
      .sort((a, b) => a.date - b.date);
    return {
      code,
      bars,
      byDate: new Map(bars.map((bar) => [bar.date, bar])),
      closes: bars.map((bar) => bar.close),
      pointer: 0,
      lastClose: null as number | null,
      indicatorCache: new Map<string, MaybeSeries>(),
    };
  });

  const dateSet = new Set<Ymd>();
  for (const entry of timeline) {
    for (const bar of entry.bars) {
      if (bar.date >= config.startDate && bar.date <= config.endDate) dateSet.add(bar.date);
    }
  }
  const dates = [...dateSet].sort((a, b) => a - b);

  if (dates.length === 0) {
    const snap = portfolio.markToMarket(config.startDate, new Map());
    return {
      dailyRecords: [],
      orders: [],
      metrics: computeMetrics({
        initialCash: config.initialCash,
        dailyRecords: [],
        orders: [],
        finalCash: snap.account.cash,
        finalMarketValue: snap.account.marketValue,
        riskFreeRate: config.riskFreeRate ?? 0,
      }),
      logs: ["engine: 回测区间内没有任何 K 线数据"],
    };
  }

  // 预热：把首日之前最后一根 K 线的收盘价作为初始估值基准。
  for (const entry of timeline) {
    while (entry.pointer < entry.bars.length && entry.bars[entry.pointer].date < dates[0]) {
      entry.lastClose = entry.bars[entry.pointer].close;
      entry.pointer += 1;
    }
  }

  const state = strategy.initialize?.({
    codes: config.codes,
    params,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
  }) as S;

  let peak = config.initialCash;
  let prevTotalAssets: number | null = null;
  const priority = config.orderPriority ?? config.codes;

  dates.forEach((date, index) => {
    for (const entry of timeline) {
      while (entry.pointer < entry.bars.length && entry.bars[entry.pointer].date <= date) {
        entry.lastClose = entry.bars[entry.pointer].close;
        entry.pointer += 1;
      }
    }

    const prices = new Map<string, number>();
    for (const entry of timeline) {
      if (entry.lastClose !== null) prices.set(entry.code, entry.lastClose);
    }

    const before = portfolio.markToMarket(date, prices);
    const dayLogs: string[] = [];

    const context: StrategyContext<P> = {
      date,
      index,
      codes: config.codes,
      bar: (code) => {
        const entry = timeline.find((item) => item.code === code);
        return entry?.byDate.get(date) ?? null;
      },
      closes: (code) => {
        const entry = timeline.find((item) => item.code === code);
        return entry ? entry.closes.slice(0, entry.pointer) : [];
      },
      indicators: (code) => {
        const entry = timeline.find((item) => item.code === code);
        if (!entry) {
          return createIndicatorApi([], () => 0, new Map());
        }
        return createIndicatorApi(entry.closes, () => entry.pointer, entry.indicatorCache);
      },
      position: (code) => before.positions.find((position) => position.code === code) ?? null,
      positions: () => before.positions,
      account: before.account,
      params,
      log: (message) => dayLogs.push(message),
    };

    const result: StrategyResult = strategy.onBar(context, state);
    if (result.logs) logs.push(...result.logs);

    for (const intent of sortOrderIntents(result.orders ?? [], priority)) {
      const entry = timeline.find((item) => item.code === intent.code);
      const bar = entry?.byDate.get(date);
      orders.push(
        executeOrder({
          date,
          intent,
          price: bar?.close,
          totalAssets: before.account.totalAssets,
          config,
          portfolio,
          knownCodes,
        }),
      );
    }

    // 期末清仓：只在最后一个交易日、所有策略订单处理完之后执行。
    if (config.liquidateAtEnd && index === dates.length - 1) {
      for (const code of portfolio.getHeldCodes()) {
        const bar = timeline.find((item) => item.code === code)?.byDate.get(date);
        orders.push(
          executeOrder({
            date,
            intent: { code, side: "sell", percent: 1, reason: "期末清仓" },
            price: bar?.close,
            totalAssets: before.account.totalAssets,
            config,
            portfolio,
            knownCodes,
          }),
        );
      }
    }

    const after = portfolio.markToMarket(date, prices);
    const totalAssets = after.account.totalAssets;
    const dailyReturn =
      prevTotalAssets !== null && prevTotalAssets > 0
        ? roundMoney(totalAssets / prevTotalAssets - 1)
        : null;

    if (totalAssets > peak) peak = totalAssets;
    const drawdown = peak > 0 ? roundMoney(totalAssets / peak - 1) : null;

    dailyRecords.push({
      date,
      cash: after.account.cash,
      marketValue: after.account.marketValue,
      totalAssets,
      realizedPnl: after.account.realizedPnl,
      unrealizedPnl: after.account.unrealizedPnl,
      fees: after.account.fees,
      dailyReturn,
      drawdown,
      positions: after.positions,
    });

    logs.push(...dayLogs);
    prevTotalAssets = totalAssets;
  });

  const finalDate = dates[dates.length - 1];
  const finalPrices = new Map<string, number>();
  for (const entry of timeline) {
    if (entry.lastClose !== null) finalPrices.set(entry.code, entry.lastClose);
  }
  const finalSnap = portfolio.markToMarket(finalDate, finalPrices);

  const metrics = computeMetrics({
    initialCash: config.initialCash,
    dailyRecords,
    orders,
    finalCash: finalSnap.account.cash,
    finalMarketValue: finalSnap.account.marketValue,
    riskFreeRate: config.riskFreeRate ?? 0,
  });

  return { dailyRecords, orders, metrics, logs };
}
