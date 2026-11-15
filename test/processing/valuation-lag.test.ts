import { describe, expect, it } from "vitest";
import { calculateValuationLag } from "../../src/processing/valuation-lag.js";

const config = { freshDays: 7, maxUsableDays: 30 };

describe("calculateValuationLag", () => {
  it("returns zero lag on the analysis date", () => {
    expect(calculateValuationLag("2026-11-13", "2026-11-13", config)).toEqual({
      lagDays: 0,
      lagTradingDays: 0,
      freshness: "fresh",
    });
  });

  it("counts natural and trading days across a weekend", () => {
    expect(calculateValuationLag("2026-11-13", "2026-11-16", config)).toEqual({
      lagDays: 3,
      lagTradingDays: 1,
      freshness: "fresh",
    });
  });

  it("marks old valuations as stale or too stale", () => {
    expect(calculateValuationLag("2026-11-01", "2026-11-13", config).freshness).toBe("stale");
    expect(calculateValuationLag("2026-10-01", "2026-11-13", config).freshness).toBe("too_stale");
  });

  it("rejects a valuation date after the analysis date", () => {
    expect(() => calculateValuationLag("2026-11-16", "2026-11-13", config)).toThrow(
      "later than analysis date",
    );
  });
});
