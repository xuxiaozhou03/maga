import { describe, expect, it } from "vitest";
import { percentileRankValues, rankValues } from "../../src/rankings/rank-values.js";

describe("rankValues", () => {
  it("uses competition ranks and code ordering for ties", () => {
    const result = rankValues(
      [
        { code: "a", value: 1 },
        { code: "c", value: 2 },
        { code: "b", value: 2 },
        { code: "d", value: 3 },
      ],
      { direction: "desc", minSample: 1, tieTolerance: 1e-12 },
    );

    expect(result).toEqual({
      validCount: 4,
      insufficientSample: false,
      items: [
        { rank: 1, code: "d", value: 3, percentile: 1, sampleValid: true },
        { rank: 2, code: "b", value: 2, percentile: 0.666666666667, sampleValid: true },
        { rank: 2, code: "c", value: 2, percentile: 0.666666666667, sampleValid: true },
        { rank: 4, code: "a", value: 1, percentile: 0, sampleValid: true },
      ],
    });
  });

  it("ranks ascending when lower values are preferred", () => {
    const result = rankValues(
      [
        { code: "a", value: 0.3 },
        { code: "b", value: 0.1 },
        { code: "c", value: 0.2 },
      ],
      { direction: "asc", minSample: 1, tieTolerance: 1e-12 },
    );

    expect(result.items.map((item) => [item.code, item.rank, item.percentile])).toEqual([
      ["b", 1, 1],
      ["c", 2, 0.5],
      ["a", 3, 0],
    ]);
  });

  it("applies relative tie tolerance", () => {
    const result = rankValues(
      [
        { code: "a", value: 1 },
        { code: "b", value: 1.0000000000005 },
        { code: "c", value: 2 },
      ],
      { direction: "desc", minSample: 1, tieTolerance: 1e-11 },
    );

    expect(result.items[0]).toMatchObject({ code: "c", rank: 1 });
    expect(result.items.slice(1).map((item) => item.rank)).toEqual([2, 2]);
  });

  it("returns empty items below the minimum sample", () => {
    const result = rankValues(
      [
        { code: "a", value: 1 },
        { code: "b", value: 2 },
      ],
      { direction: "desc", minSample: 5, tieTolerance: 1e-12 },
    );

    expect(result).toEqual({ items: [], validCount: 2, insufficientSample: true });
  });

  it("filters null and non-finite values", () => {
    const result = rankValues(
      [
        { code: "a", value: null },
        { code: "b", value: Number.NaN },
        { code: "c", value: Number.POSITIVE_INFINITY },
        { code: "d", value: 1 },
      ],
      { direction: "desc", minSample: 1, tieTolerance: 1e-12 },
    );

    expect(result.validCount).toBe(1);
    expect(result.items).toEqual([
      { rank: 1, code: "d", value: 1, percentile: 1, sampleValid: true },
    ]);
  });

  it("rejects duplicate input codes", () => {
    expect(() =>
      rankValues(
        [
          { code: "a", value: 1 },
          { code: "a", value: 2 },
        ],
        { direction: "desc", minSample: 1, tieTolerance: 1e-12 },
      ),
    ).toThrow("Duplicate ranking input code");
  });
});

describe("percentileRankValues", () => {
  it("returns magnitude percentiles where larger values score higher", () => {
    const result = percentileRankValues(
      [
        { code: "a", value: 0.1 },
        { code: "b", value: 0.2 },
        { code: "c", value: 0.2 },
        { code: "d", value: 0.4 },
      ],
      1e-12,
    );

    expect(Object.fromEntries(result)).toEqual({
      a: 0,
      b: 0.333333333333,
      c: 0.333333333333,
      d: 1,
    });
  });
});
