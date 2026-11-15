import { describe, expect, it } from "vitest";
import { calculateValuationFeatures } from "../../src/calculations/valuation.js";
import type { IndexValuationItem } from "../../src/domain/valuation.js";
import { loadCalculationConfig } from "./support.js";

function valuation(
  date: string,
  type: "PE" | "PB" | "PS",
  value: number,
  percentile: number | null,
  peg: number | null = null,
): IndexValuationItem {
  return {
    date,
    type,
    value,
    historicalPercentile: percentile,
    peg,
    pegUsable: peg !== null && peg > 0,
    source: "hongsehuojian",
    collectedAt: "2026-11-15T08:00:00.000Z",
  };
}

describe("calculateValuationFeatures", () => {
  it("uses the latest non-future valuation and computes lag", async () => {
    const config = await loadCalculationConfig();
    const result = calculateValuationFeatures(
      [
        valuation("2026-11-12", "PE", 13.39, 0.7351, -37.6),
        valuation("2026-11-13", "PE", 13.4199, 0.7376, -40.9339),
        valuation("2026-11-17", "PE", 99, 0.99, 9),
        valuation("2026-11-13", "PB", 1.3326, 0.3226, 1.25),
      ],
      "2026-11-16",
      config,
    );

    expect(result.pe).toMatchObject({
      value: 13.4199,
      historicalPercentile: 0.7376,
      date: "2026-11-13",
      lagDays: 3,
      lagTradingDays: 1,
      peg: -40.9339,
      pegUsable: false,
      freshness: "fresh",
    });
    expect(result.pb).toMatchObject({ peg: null, pegUsable: false });
    expect(result.ps).toBeNull();
  });

  it("returns null for missing valuation types", async () => {
    const config = await loadCalculationConfig();
    expect(calculateValuationFeatures([], "2026-11-13", config)).toEqual({
      pe: null,
      pb: null,
      ps: null,
    });
  });
});
