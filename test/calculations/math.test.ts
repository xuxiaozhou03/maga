import { describe, expect, it } from "vitest";
import {
  calculateDrawdown,
  countNewHighs,
  maximumNegativeStreak,
  maximumPositiveStreak,
  mean,
  median,
  roundTo,
  standardDeviation,
  validAmountAverage,
} from "../../src/calculations/math.js";

describe("calculation math", () => {
  it("rounds to 12 decimal places and normalizes negative zero", () => {
    expect(roundTo(1 / 3)).toBe(0.333333333333);
    expect(roundTo(-0.0000000000001)).toBe(0);
    expect(Object.is(roundTo(-0.0000000000001), -0)).toBe(false);
  });

  it("computes mean, median, and population standard deviation", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2, 4])).toBe(2.5);
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9], 0)).toBe(2);
  });

  it("computes drawdown with peak and trough dates", () => {
    const result = calculateDrawdown([
      { date: "2026-01-01", close: 100 },
      { date: "2026-01-02", close: 120 },
      { date: "2026-01-03", close: 90 },
      { date: "2026-01-04", close: 110 },
      { date: "2026-01-05", close: 80 },
    ]);
    expect(result.maxDrawdown).toBeCloseTo(-1 / 3, 15);
    expect(result.peakDate).toBe("2026-01-02");
    expect(result.troughDate).toBe("2026-01-05");
  });

  it("applies the 80% amount sample rule without filling missing values", () => {
    expect(validAmountAverage([10, null, 20, 30, 40], 5, 0.8)).toEqual({
      average: 25,
      sampleCount: 4,
    });
    expect(validAmountAverage([10, null, null, 20, 30], 5, 0.8)).toEqual({
      average: null,
      sampleCount: 3,
    });
  });

  it("counts streaks and new highs deterministically", () => {
    const returns = [0.01, 0.02, 0, -0.01, -0.02, -0.03, 0.04];
    expect(maximumPositiveStreak(returns)).toBe(2);
    expect(maximumNegativeStreak(returns)).toBe(3);
    expect(countNewHighs([1, 2, 1.5, 2.5, 2.4, 3])).toBe(3);
  });
});
