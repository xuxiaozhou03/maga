import { describe, expect, it } from "vitest";
import { calculateReturns } from "../../src/calculations/returns.js";
import { loadCalculationConfig, makeKline, rowsFromCloses } from "./support.js";

describe("calculateReturns", () => {
  it("computes all configured fixed-window returns", async () => {
    const config = await loadCalculationConfig();
    const closes = Array.from({ length: 251 }, (_, index) => 100 * 1.01 ** index);
    const result = calculateReturns(rowsFromCloses(closes), "2025-09-08", config);

    for (const periods of [1, 5, 20, 60, 120, 250]) {
      expect(result[`${periods}d` as keyof typeof result]).toBeCloseTo(1.01 ** periods - 1, 12);
    }
  });

  it("uses the previous calendar year's final row for YTD", async () => {
    const config = await loadCalculationConfig();
    const rows = [
      makeKline("2025-12-30", 100),
      makeKline("2025-12-31", 101),
      makeKline("2026-01-02", 102),
    ];

    const result = calculateReturns(rows, "2026-01-02", config);
    expect(result.ytd).toBeCloseTo(102 / 101 - 1, 12);
    expect(result["1d"]).toBeCloseTo(102 / 101 - 1, 12);
    expect(result["5d"]).toBeNull();
  });

  it("returns null when the sample is too short", async () => {
    const config = await loadCalculationConfig();
    const result = calculateReturns([makeKline("2026-01-02", 100)], "2026-01-02", config);

    expect(Object.values(result).every((value) => value === null)).toBe(true);
  });
});
