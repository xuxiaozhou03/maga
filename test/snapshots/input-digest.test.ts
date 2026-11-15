import { describe, expect, it } from "vitest";
import type { IndexValuationItem } from "../../src/domain/valuation.js";
import { buildInputDigest, fingerprintOfInputDigest } from "../../src/snapshots/input-digest.js";
import type { Kline } from "../../src/sources/types.js";

const ANALYSIS_DATE = "2026-11-13";
const HASH = `sha256:${"a".repeat(64)}`;

function kline(code: string, date: string, close: number): Kline {
  return {
    code,
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
    amount: 1_000,
    change: 0,
    changePercent: 0,
  };
}

function valuation(date: string, value: number, collectedAt: string): IndexValuationItem {
  return {
    date,
    type: "PE",
    value,
    historicalPercentile: 0.5,
    peg: null,
    pegUsable: false,
    source: "hongsehuojian",
    collectedAt,
  };
}

describe("buildInputDigest", () => {
  it("is stable across map and row ordering and ignores collection timestamps", () => {
    const base = {
      analysisDate: ANALYSIS_DATE,
      algorithmVersion: "0.5.1",
      configHash: HASH,
      ruleConfigHash: HASH,
      categoryMappingHash: HASH,
      poolHash: HASH,
    };
    const first = buildInputDigest({
      ...base,
      klinesByCode: new Map([
        [
          "510300.SH",
          [kline("510300.SH", "2026-11-12", 4), kline("510300.SH", ANALYSIS_DATE, 4.1)],
        ],
        ["159915.SZ", [kline("159915.SZ", ANALYSIS_DATE, 2)]],
      ]),
      valuationsByCode: new Map([
        ["000300.SH", [valuation(ANALYSIS_DATE, 12, "2026-11-15T08:00:00.000Z")]],
      ]),
    });
    const second = buildInputDigest({
      ...base,
      klinesByCode: new Map([
        ["159915.SZ", [kline("159915.SZ", ANALYSIS_DATE, 2)]],
        [
          "510300.SH",
          [kline("510300.SH", ANALYSIS_DATE, 4.1), kline("510300.SH", "2026-11-12", 4)],
        ],
      ]),
      valuationsByCode: new Map([
        ["000300.SH", [valuation(ANALYSIS_DATE, 12, "2026-11-16T08:00:00.000Z")]],
      ]),
    });

    expect(first).toEqual(second);
    expect(fingerprintOfInputDigest(first)).toBe(fingerprintOfInputDigest(second));
    expect(first.etfs.map((item) => item.code)).toEqual(["159915.SZ", "510300.SH"]);
    expect(first.etfs[1]).toMatchObject({
      firstDate: "2026-11-12",
      lastDate: ANALYSIS_DATE,
      rowCount: 2,
    });
  });

  it("rejects future and duplicate Kline rows", () => {
    const input = {
      analysisDate: ANALYSIS_DATE,
      algorithmVersion: "0.5.1",
      configHash: HASH,
      ruleConfigHash: HASH,
      categoryMappingHash: HASH,
      poolHash: HASH,
      valuationsByCode: new Map<string, IndexValuationItem[]>(),
    };

    expect(() =>
      buildInputDigest({
        ...input,
        klinesByCode: new Map([["510300.SH", [kline("510300.SH", "2026-11-14", 4)]]]),
      }),
    ).toThrow("Future Kline row");
    expect(() =>
      buildInputDigest({
        ...input,
        klinesByCode: new Map([
          [
            "510300.SH",
            [kline("510300.SH", ANALYSIS_DATE, 4), kline("510300.SH", ANALYSIS_DATE, 4.1)],
          ],
        ]),
      }),
    ).toThrow("Duplicate Kline date");
  });
});
