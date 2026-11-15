import { describe, expect, it } from "vitest";
import { calculateRisk } from "../../src/calculations/risk.js";
import { loadCalculationConfig, rowsFromCloses } from "./support.js";

describe("calculateRisk", () => {
  it("returns zero volatility and drawdown for a flat series", async () => {
    const config = await loadCalculationConfig();
    const result = calculateRisk(rowsFromCloses(Array.from({ length: 121 }, () => 100)), config);

    expect(result).toMatchObject({
      volatility20d: 0,
      volatility60d: 0,
      volatility120d: 0,
      maxDrawdown20d: 0,
      maxDrawdown60d: 0,
      maxDrawdown120d: 0,
      currentDrawdown: 0,
      sampleHigh: 100,
      distanceFromSampleHigh: 0,
      maxDrawdown60dPeakDate: null,
      maxDrawdown60dTroughDate: null,
    });
    expect(result.maxDrawdown250d).toBeNull();
  });

  it("computes current drawdown from the available sample high", async () => {
    const config = await loadCalculationConfig();
    const result = calculateRisk(rowsFromCloses([100, 120, 90, 110, 80]), config);

    expect(result.sampleHigh).toBe(120);
    expect(result.currentDrawdown).toBe(-0.333333333333);
    expect(result.distanceFromSampleHigh).toBe(-0.333333333333);
    expect(result.volatility20d).toBeNull();
  });

  it("returns all-null fields for empty input", async () => {
    const config = await loadCalculationConfig();
    const result = calculateRisk([], config);
    expect(Object.values(result).every((value) => value === null)).toBe(true);
  });
});
