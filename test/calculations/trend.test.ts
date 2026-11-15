import { describe, expect, it } from "vitest";
import { calculateTrend } from "../../src/calculations/trend.js";
import { loadCalculationConfig, rowsFromCloses } from "./support.js";

describe("calculateTrend", () => {
  it("computes moving averages, alignment, and Bollinger bands", async () => {
    const config = await loadCalculationConfig();
    const result = calculateTrend(
      rowsFromCloses(Array.from({ length: 120 }, (_, index) => index + 1)),
      config,
    );
    const bollStd = Math.sqrt(33.25);

    expect(result).toMatchObject({
      close: 120,
      ma5: 118,
      ma10: 115.5,
      ma20: 110.5,
      ma60: 90.5,
      ma120: 60.5,
      aboveMa20: true,
      aboveMa60: true,
      aboveMa120: true,
      maAlignment: "bullish",
      maAlignmentScore: 6,
    });
    expect(result.ma20Deviation).toBeCloseTo(120 / 110.5 - 1, 12);
    expect(result.ma60Deviation).toBeCloseTo(120 / 90.5 - 1, 12);
    expect(result.boll20.middle).toBe(110.5);
    expect(result.boll20.upper).toBeCloseTo(110.5 + 2 * bollStd, 12);
    expect(result.boll20.lower).toBeCloseTo(110.5 - 2 * bollStd, 12);
  });

  it("identifies a bearish alignment", async () => {
    const config = await loadCalculationConfig();
    const result = calculateTrend(
      rowsFromCloses(Array.from({ length: 120 }, (_, index) => 120 - index)),
      config,
    );

    expect(result.maAlignment).toBe("bearish");
    expect(result.maAlignmentScore).toBe(0);
  });

  it("returns null fields for an insufficient sample", async () => {
    const config = await loadCalculationConfig();
    const result = calculateTrend(rowsFromCloses([1, 2, 3, 4]), config);

    expect(result.ma5).toBeNull();
    expect(result.close).toBe(4);
    expect(result.maAlignment).toBeNull();
    expect(result.boll20.middle).toBeNull();
  });
});
