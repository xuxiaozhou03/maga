import { describe, expect, it } from "vitest";
import { calculateHistoryFeatures } from "../../src/calculations/history.js";
import { loadCalculationConfig, rowsFromCloses } from "./support.js";

describe("calculateHistoryFeatures", () => {
  it("computes the 1m history from the golden 22-row sample", async () => {
    const config = await loadCalculationConfig();
    const rows = rowsFromCloses(Array.from({ length: 22 }, (_, index) => 100 + index));
    const result = calculateHistoryFeatures(rows, "2025-01-22", config);

    expect(result).toEqual({
      "1m": {
        tradingDays: 21,
        totalReturn: 0.21,
        annualizedReturn: 8.849732675808,
        meanDailyReturn: 0.009118608082,
        medianDailyReturn: 0.009090909091,
        dailyReturnStd: 0.000503786741,
        annualizedVolatility: 0.007997366576,
        maxDrawdown: 0,
        sharpe: 287.330737527213,
        sortino: null,
        calmar: null,
        maxUpStreak: 21,
        maxDownStreak: 0,
        newHighCount: 21,
        averageAmount: 1105,
        amountSampleCount: 22,
      },
      "3m": null,
      "6m": null,
      ytd: null,
      "1y": null,
      "2y": null,
    });
  });

  it("uses the final prior-year row as the YTD base", async () => {
    const config = await loadCalculationConfig();
    const rows = rowsFromCloses([100, 101, 102], { start: "2024-12-30" });
    const result = calculateHistoryFeatures(rows, "2025-01-01", config);

    expect(result.ytd).toMatchObject({
      tradingDays: 1,
      maxUpStreak: 1,
      newHighCount: 1,
    });
    expect(result.ytd?.totalReturn).toBeCloseTo(102 / 101 - 1, 12);
    expect(result["1m"]).toBeNull();
    expect(result["3m"]).toBeNull();
    expect(result["6m"]).toBeNull();
    expect(result["1y"]).toBeNull();
    expect(result["2y"]).toBeNull();
  });

  it("counts consecutive down days and negative returns", async () => {
    const config = await loadCalculationConfig();
    const closes = Array.from({ length: 22 }, (_, index) => 121 - index);
    const result = calculateHistoryFeatures(rowsFromCloses(closes), "2025-01-22", config);

    expect(result["1m"]).toMatchObject({
      tradingDays: 21,
      maxUpStreak: 0,
      maxDownStreak: 21,
      newHighCount: 0,
    });
    expect(result["1m"]?.totalReturn).toBeCloseTo(100 / 121 - 1, 12);
    expect(result["1m"]?.maxDrawdown).toBeCloseTo(-(1 - 100 / 121), 12);
  });

  it("returns null risk-adjusted metrics for a flat series", async () => {
    const config = await loadCalculationConfig();
    const result = calculateHistoryFeatures(
      rowsFromCloses(Array.from({ length: 22 }, () => 100)),
      "2025-01-22",
      config,
    );

    expect(result["1m"]).toMatchObject({
      tradingDays: 21,
      totalReturn: 0,
      annualizedReturn: 0,
      dailyReturnStd: 0,
      annualizedVolatility: 0,
      maxDrawdown: 0,
      sharpe: null,
      sortino: null,
      calmar: null,
      maxUpStreak: 0,
      maxDownStreak: 0,
      newHighCount: 0,
    });
  });
});
