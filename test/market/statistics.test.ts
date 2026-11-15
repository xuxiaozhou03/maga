import { describe, expect, it } from "vitest";
import { distribution, quantileLinear } from "../../src/market/statistics.js";

describe("quantileLinear", () => {
  it("uses linear interpolation", () => {
    const values = [0, 0.01, 0.02, 0.03, 0.04];
    expect(quantileLinear(values, 0.1)).toBe(0.004);
    expect(quantileLinear(values, 0.25)).toBe(0.01);
    expect(quantileLinear(values, 0.5)).toBe(0.02);
    expect(quantileLinear(values, 0.75)).toBe(0.03);
    expect(quantileLinear(values, 0.9)).toBe(0.036);
  });

  it("returns null for an empty sample", () => {
    expect(quantileLinear([], 0.5)).toBeNull();
  });
});

describe("distribution", () => {
  it("uses left-closed right-open bins and a closed final upper bound", () => {
    const result = distribution([-1, -0.01, 0, 0.01, 1], [-1, 0, 1]);
    expect(result).toEqual([
      { lower: -1, upper: 0, count: 2 },
      { lower: 0, upper: 1, count: 3 },
    ]);
  });

  it("rejects unsorted bounds", () => {
    expect(() => distribution([1], [0, 1, 0.5])).toThrow("strictly ascending");
  });
});
