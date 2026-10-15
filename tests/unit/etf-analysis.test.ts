import { describe, expect, it } from "vitest";
import { analyzeKlines } from "@/services/analysis/etf-analysis";
import type { ValidatableBar } from "@/services/market-data/validator";

function bar(date: number, close: number, overrides: Partial<ValidatableBar> = {}): ValidatableBar {
  return {
    code: "TEST.SH",
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
    amount: close * 1000,
    ...overrides,
  };
}

describe("analyzeKlines", () => {
  it("空输入返回空结构", () => {
    const result = analyzeKlines([]);
    expect(result.count).toBe(0);
    expect(result.firstDate).toBeNull();
    expect(result.totalReturn).toBeNull();
    expect(result.points).toEqual([]);
    expect(result.returnDistribution).toEqual([]);
    expect(result.quality.checkedBars).toBe(0);
  });

  it("单调上涨：区间收益、上涨占比、单日极值", () => {
    const result = analyzeKlines([bar(20240102, 10), bar(20240103, 11), bar(20240104, 12)]);

    expect(result.count).toBe(3);
    expect(result.firstClose).toBe(10);
    expect(result.lastClose).toBe(12);
    expect(result.totalReturn).toBe(0.2);
    expect(result.maxDrawdown).toBe(0);
    expect(result.upDayRatio).toBe(1);
    expect(result.bestDay).toEqual({ date: 20240103, value: 0.1 });
    expect(result.worstDay?.date).toBe(20240104);
    expect(result.averageVolume).toBe(1000);
    expect(result.maxAmountDay).toEqual({ date: 20240104, value: 12_000 });
  });

  it("回撤按历史高点计算，并写入点位", () => {
    const result = analyzeKlines([
      bar(20240102, 10),
      bar(20240103, 12),
      bar(20240104, 9),
      bar(20240105, 11),
    ]);

    expect(result.maxDrawdown).toBe(-0.25);
    expect(result.points[2]).toEqual({ date: 20240104, close: 9, drawdown: -0.25 });
    expect(result.points[3]?.drawdown).toBe(-0.0833);
  });

  it("统计相邻 K 线的最大自然日间隔", () => {
    const result = analyzeKlines([bar(20240102, 10), bar(20240103, 11), bar(20240120, 12)]);
    expect(result.maxGapDays).toBe(17);
  });

  it("数据质量问题进入 quality 且保留明细", () => {
    const result = analyzeKlines([
      bar(20240102, 10),
      bar(20240103, 11, { high: 5, low: 20 }),
      bar(20240103, 12),
    ]);

    expect(result.quality.checkedBars).toBe(3);
    expect(result.quality.errors).toBeGreaterThan(0);
    expect(result.quality.issues.some((issue) => issue.rule === "ohlc.high_below_low")).toBe(true);
    expect(result.quality.issues.some((issue) => issue.rule === "date.duplicate")).toBe(true);
  });

  it("日收益分布覆盖全部交易日且计数正确", () => {
    const result = analyzeKlines([
      bar(20240102, 10),
      bar(20240103, 11),
      bar(20240104, 10),
      bar(20240105, 12),
    ]);

    const total = result.returnDistribution.reduce((acc, bin) => acc + bin.count, 0);
    expect(result.returnDistribution.length).toBeGreaterThan(1);
    expect(total).toBe(3);
    expect(result.returnDistribution[0].from).toBeLessThanOrEqual(result.returnDistribution[0].to);
  });
});
