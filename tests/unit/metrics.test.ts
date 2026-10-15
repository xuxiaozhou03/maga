import { describe, expect, it } from "vitest";
import { computeMetrics, maxDrawdown } from "@/services/backtest/metrics/metrics";
import type { DailyRecord, OrderRecord } from "@/services/backtest/types";

function record(date: number, totalAssets: number, dailyReturn: number | null): DailyRecord {
  return {
    date,
    cash: totalAssets,
    marketValue: 0,
    totalAssets,
    realizedPnl: 0,
    unrealizedPnl: 0,
    fees: 0,
    dailyReturn,
    drawdown: null,
    positions: [],
  };
}

function order(overrides: Partial<OrderRecord>): OrderRecord {
  return {
    date: 20240102,
    code: "510300.SH",
    side: "sell",
    requestedQuantity: 100,
    executedQuantity: 100,
    price: 10,
    amount: 1000,
    fee: 5,
    status: "filled",
    reason: null,
    strategyReason: null,
    realizedPnl: null,
    ...overrides,
  };
}

describe("maxDrawdown", () => {
  it("返回最大峰谷回撤（负数）", () => {
    expect(maxDrawdown([100, 120, 90, 150])).toBe(-0.25);
  });

  it("单调上涨时无回撤", () => {
    expect(maxDrawdown([100, 110, 120])).toBe(0);
  });

  it("空序列返回 null", () => {
    expect(maxDrawdown([])).toBeNull();
  });
});

describe("computeMetrics", () => {
  it("把总收益率、交易次数与盈亏比算清楚", () => {
    const orders = [
      order({ side: "buy", realizedPnl: null, fee: 5 }),
      order({ realizedPnl: 100, fee: 5 }),
      order({ realizedPnl: -50, fee: 5 }),
    ];
    const metrics = computeMetrics({
      initialCash: 1000,
      dailyRecords: [record(20240102, 1000, null), record(20240103, 1000, 0)],
      orders,
      finalCash: 900,
      finalMarketValue: 100,
    });

    expect(metrics.finalTotalAssets).toBe(1000);
    expect(metrics.totalReturn).toBe(0);
    expect(metrics.tradeCount).toBe(3);
    expect(metrics.winRate).toBe(0.5);
    expect(metrics.averageWin).toBe(100);
    expect(metrics.averageLoss).toBe(-50);
    expect(metrics.totalFees).toBe(15);
  });

  it("按 252 个交易日年化波动率与夏普比率", () => {
    const metrics = computeMetrics({
      initialCash: 1000,
      dailyRecords: [
        record(20240102, 1000, null),
        record(20240103, 1010, 0.01),
        record(20240104, 1000, -0.00990099),
      ],
      orders: [],
      finalCash: 1000,
      finalMarketValue: 0,
    });

    expect(metrics.annualizedVolatility).not.toBeNull();
    expect(metrics.annualizedVolatility as number).toBeGreaterThan(0.2);
    expect(metrics.sharpeRatio).not.toBeNull();
  });

  it("数据不足时返回 null 并给出原因", () => {
    const metrics = computeMetrics({
      initialCash: 1000,
      dailyRecords: [],
      orders: [],
      finalCash: 1000,
      finalMarketValue: 0,
    });

    expect(metrics.totalReturn).toBe(0);
    expect(metrics.annualizedReturn).toBeNull();
    expect(metrics.maxDrawdown).toBeNull();
    expect(metrics.annualizedVolatility).toBeNull();
    expect(metrics.sharpeRatio).toBeNull();
    expect(metrics.winRate).toBeNull();
    expect(metrics.reasons.annualizedReturn).toBeTruthy();
    expect(metrics.reasons.maxDrawdown).toBeTruthy();
    expect(metrics.reasons.winRate).toBeTruthy();
  });

  it("没有卖出成交时不计算胜率，但保留买入费用", () => {
    const metrics = computeMetrics({
      initialCash: 1000,
      dailyRecords: [record(20240102, 995, null), record(20240103, 1000, 0.005025)],
      orders: [order({ side: "buy", realizedPnl: null, fee: 5 })],
      finalCash: 1000,
      finalMarketValue: 0,
    });

    expect(metrics.winRate).toBeNull();
    expect(metrics.reasons.winRate).toBeTruthy();
    expect(metrics.totalFees).toBe(5);
  });

  it("未成交订单不计入交易次数与费用", () => {
    const metrics = computeMetrics({
      initialCash: 1000,
      dailyRecords: [record(20240102, 1000, null)],
      orders: [order({ status: "rejected", reason: "insufficient_cash", fee: 5 })],
      finalCash: 1000,
      finalMarketValue: 0,
    });

    expect(metrics.tradeCount).toBe(0);
    expect(metrics.totalFees).toBe(0);
  });
});
