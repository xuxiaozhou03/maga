import { describe, expect, it } from "vitest";
import { moneyEquals } from "@/lib/math";
import { runBacktest } from "@/services/backtest/engine/engine";
import {
  buyAndHoldStrategy,
  movingAverageCrossStrategy,
} from "@/services/backtest/engine/builtin-strategies";
import type { BacktestConfig, MarketSeries } from "@/services/backtest/types";

const DATES = [
  20240102, 20240103, 20240104, 20240105, 20240108, 20240109, 20240110, 20240111, 20240112,
  20240115,
];

const FREE_FEE = { commissionRate: 0, minCommission: 0, stampDutyRate: 0, transferFeeRate: 0 };

function makeSeries(code: string, closes: readonly number[]): MarketSeries {
  return {
    code,
    bars: closes.map((close, index) => ({
      code,
      date: DATES[index],
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
      amount: close * 1000,
    })),
  };
}

function baseConfig(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    initialCash: 10_000,
    startDate: DATES[0],
    endDate: DATES[DATES.length - 1],
    codes: ["TEST.SH"],
    fee: FREE_FEE,
    trading: { lotSize: 100 },
    ...overrides,
  };
}

describe("runBacktest（合成数据）", () => {
  it("买入持有：满仓买入并在期末估值", () => {
    const prices = [10, 11, 12, 13, 14, 13, 12, 11, 10, 9];
    const result = runBacktest({
      strategy: buyAndHoldStrategy,
      config: baseConfig(),
      series: [makeSeries("TEST.SH", prices)],
    });

    expect(result.dailyRecords).toHaveLength(DATES.length);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].status).toBe("filled");
    expect(result.orders[0].executedQuantity).toBe(1000);
    expect(result.metrics.finalTotalAssets).toBe(9000);
    expect(result.metrics.totalReturn).toBe(-0.1);
    // 最高 14000 → 最低 9000
    expect(result.metrics.maxDrawdown).toBe(-0.3571);
    expect(result.metrics.tradeCount).toBe(1);
  });

  it("每一日的总资产恒等于现金 + 持仓市值", () => {
    const result = runBacktest({
      strategy: buyAndHoldStrategy,
      config: baseConfig(),
      series: [makeSeries("TEST.SH", [10, 11, 12, 13, 14, 13, 12, 11, 10, 9])],
    });

    for (const record of result.dailyRecords) {
      expect(moneyEquals(record.totalAssets, record.cash + record.marketValue)).toBe(true);
      expect(
        moneyEquals(record.totalAssets, 10_000 + record.realizedPnl + record.unrealizedPnl),
      ).toBe(true);
      expect(record.totalAssets).toBeGreaterThanOrEqual(0);
      expect(record.cash).toBeGreaterThanOrEqual(0);
    }
  });

  it("期末清仓时卖出全部持仓并记录实现盈亏", () => {
    const result = runBacktest({
      strategy: buyAndHoldStrategy,
      config: baseConfig({ liquidateAtEnd: true }),
      series: [makeSeries("TEST.SH", [10, 11, 12, 13, 14, 13, 12, 11, 10, 9])],
    });

    expect(result.orders).toHaveLength(2);
    const sell = result.orders[1];
    expect(sell.side).toBe("sell");
    expect(sell.executedQuantity).toBe(1000);
    expect(sell.realizedPnl).toBe(-1000);
    expect(result.dailyRecords[result.dailyRecords.length - 1].marketValue).toBe(0);
    expect(result.metrics.finalTotalAssets).toBe(9000);
  });

  it("买入费用使可买数量回退整手", () => {
    const result = runBacktest({
      strategy: buyAndHoldStrategy,
      config: baseConfig({
        fee: { commissionRate: 0.0003, minCommission: 5, stampDutyRate: 0, transferFeeRate: 0 },
      }),
      series: [makeSeries("TEST.SH", [10, 10, 10, 10, 10, 10, 10, 10, 10, 10])],
    });

    expect(result.orders[0].executedQuantity).toBe(900);
    expect(result.orders[0].fee).toBe(5);
    expect(result.metrics.totalFees).toBe(5);
  });

  it("均线交叉：先金叉买入，再死叉卖出", () => {
    const strategy = {
      ...movingAverageCrossStrategy,
      params: { code: "TEST.SH", fast: 2, slow: 4 },
    };
    const result = runBacktest({
      strategy,
      config: baseConfig(),
      series: [makeSeries("TEST.SH", [10, 10, 10, 10, 10, 13, 16, 16, 13, 10])],
    });

    const filled = result.orders.filter((order) => order.status === "filled");
    expect(filled.some((order) => order.side === "buy")).toBe(true);
    expect(filled.some((order) => order.side === "sell")).toBe(true);
    expect(filled[0].side).toBe("buy");
    expect(filled[filled.length - 1].side).toBe("sell");
    expect(result.metrics.tradeCount).toBe(2);

    for (const record of result.dailyRecords) {
      expect(moneyEquals(record.totalAssets, record.cash + record.marketValue)).toBe(true);
    }
  });

  it("区间内没有数据时返回空结果并给出原因", () => {
    const result = runBacktest({
      strategy: buyAndHoldStrategy,
      config: baseConfig({ startDate: 20250101, endDate: 20250131 }),
      series: [makeSeries("TEST.SH", [10, 11, 12, 13, 14, 13, 12, 11, 10, 9])],
    });

    expect(result.dailyRecords).toHaveLength(0);
    expect(result.orders).toHaveLength(0);
    expect(result.logs.join(" ")).toContain("没有任何 K 线数据");
  });

  it("对非法配置抛出异常", () => {
    expect(() =>
      runBacktest({
        strategy: buyAndHoldStrategy,
        config: baseConfig({ initialCash: 0 }),
        series: [makeSeries("TEST.SH", [10])],
      }),
    ).toThrow(RangeError);
  });
});
