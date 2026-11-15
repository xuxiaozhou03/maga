import { describe, expect, it } from "vitest";
import {
  deriveCoverage,
  mergeValuationItems,
  normalizeRawValuations,
} from "../../src/collectors/valuation-normalizer.js";
import type { RawValuation } from "../../src/sources/types.js";
import { CapturingLogger } from "../sources/support.js";

function raw(
  tradeDate: string,
  historicalPercentile: number | null,
  peg: number | null = null,
  valuationValue = 10,
): RawValuation {
  return { tradeDate, historicalPercentile, peg, valuationValue };
}

describe("normalizeRawValuations", () => {
  it("normalizes every percentile as a 0-100 percentage and stores invalid values as null", () => {
    const logger = new CapturingLogger();
    const result = normalizeRawValuations(
      [
        raw("20261110", 0),
        raw("20261111", 1),
        raw("20261112", 73.76),
        raw("20261113", 100),
        raw("20261114", 101),
        raw("20261115", null),
      ],
      {
        code: "000300.SH",
        type: "PE",
        analysisDate: "2026-11-15",
        collectedAt: "2026-11-15T08:00:00.000Z",
        logger,
      },
    );

    expect(result.items.map((item) => item.historicalPercentile)).toEqual([
      0,
      0.01,
      0.7376,
      1,
      null,
      null,
    ]);
    expect(result.warnings.invalidPercentile).toBe(1);
    expect(result.items[0]).toMatchObject({
      date: "2026-11-10",
      type: "PE",
      source: "hongsehuojian",
    });
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        context: expect.objectContaining({ event: "valuation_normalization_warnings" }),
      }),
    );
  });

  it("keeps PEG only for PE and marks positive PEG as usable", () => {
    const pe = normalizeRawValuations([raw("20261113", 50, 1.25)], {
      code: "000300.SH",
      type: "PE",
      analysisDate: "2026-11-15",
      collectedAt: "2026-11-15T08:00:00.000Z",
    }).items[0];
    const pb = normalizeRawValuations([raw("20261113", 50, 1.25)], {
      code: "000300.SH",
      type: "PB",
      analysisDate: "2026-11-15",
      collectedAt: "2026-11-15T08:00:00.000Z",
    }).items[0];

    expect(pe).toMatchObject({ peg: 1.25, pegUsable: true });
    expect(pb).toMatchObject({ peg: null, pegUsable: false });
  });

  it("skips invalid dates, future dates, and non-finite values", () => {
    const result = normalizeRawValuations(
      [
        raw("not-a-date", 50),
        raw("20261116", 50),
        raw("20261115", 50, null, Number.POSITIVE_INFINITY),
        raw("20261113", 50),
      ],
      {
        code: "000300.SH",
        type: "PE",
        analysisDate: "2026-11-15",
        collectedAt: "2026-11-15T08:00:00.000Z",
      },
    );

    expect(result.items.map((item) => item.date)).toEqual(["2026-11-13"]);
    expect(result.warnings).toMatchObject({ invalidDate: 1, futureDate: 1, invalidValue: 1 });
  });
});

describe("valuation merge and coverage", () => {
  it("replaces matching date/type keys while preserving older history", () => {
    const first = normalizeRawValuations([raw("20261112", 40)], {
      code: "000300.SH",
      type: "PE",
      analysisDate: "2026-11-15",
      collectedAt: "2026-11-15T08:00:00.000Z",
    }).items;
    const second = normalizeRawValuations([raw("20261113", 73.76)], {
      code: "000300.SH",
      type: "PE",
      analysisDate: "2026-11-15",
      collectedAt: "2026-11-15T09:00:00.000Z",
    }).items;

    expect(mergeValuationItems(first, second, "PE")).toEqual([...first, ...second]);
    expect(deriveCoverage([...first, ...second], { PE: true, PB: false, PS: false })).toMatchObject(
      {
        PE: { supported: true, lastDate: "2026-11-13", count: 2 },
        PB: { supported: false, lastDate: null, count: 0 },
      },
    );
  });

  it("uses the newest value for an existing date/type key", () => {
    const first = normalizeRawValuations([raw("20261113", 40, null, 10)], {
      code: "000300.SH",
      type: "PE",
      analysisDate: "2026-11-15",
      collectedAt: "2026-11-15T08:00:00.000Z",
    }).items;
    const replacement = normalizeRawValuations([raw("20261113", 60, null, 12)], {
      code: "000300.SH",
      type: "PE",
      analysisDate: "2026-11-15",
      collectedAt: "2026-11-15T09:00:00.000Z",
    }).items;

    const merged = mergeValuationItems(first, replacement, "PE");
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      value: 12,
      historicalPercentile: 0.6,
      collectedAt: "2026-11-15T09:00:00.000Z",
    });
  });
});
