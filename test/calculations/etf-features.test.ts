import { describe, expect, it } from "vitest";
import {
  calculateEtfFeatureFile,
  type CalculateEtfFeatureFileInput,
} from "../../src/calculations/etf-features.js";
import type { IndexValuationItem } from "../../src/domain/valuation.js";
import { loadCalculationConfig, makeKline, rowsFromCloses } from "./support.js";

const ANALYSIS_DATE = "2025-01-22";
const COMPUTED_AT = "2025-01-22T08:00:00.000Z";

function goldenKlines() {
  return rowsFromCloses(Array.from({ length: 22 }, (_, index) => 100 + index));
}

function valuation(
  date: string,
  type: "PE" | "PB" | "PS",
  value: number,
  percentile: number,
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
    collectedAt: `${date}T08:00:00.000Z`,
  };
}

async function goldenInput(): Promise<CalculateEtfFeatureFileInput> {
  return {
    etf: { code: "510300.SH", name: "沪深300ETF", exchange: "SH" },
    analysisDate: ANALYSIS_DATE,
    category: {
      primaryCode: null,
      secondaryCode: null,
      status: "pending",
      mappingVersion: 1,
    },
    klines: goldenKlines(),
    valuations: [
      valuation("2025-01-20", "PE", 12.5, 0.4, 1.2),
      valuation("2025-01-21", "PB", 1.3, 0.3),
      valuation("2025-01-22", "PS", 2.4, 0.6),
    ],
    config: await loadCalculationConfig(),
    computedAt: COMPUTED_AT,
  };
}

const GOLDEN_FEATURE_FILE = {
  schemaVersion: 1,
  code: "510300.SH",
  name: "沪深300ETF",
  exchange: "SH",
  analysisDate: ANALYSIS_DATE,
  latestKlineDate: "2025-01-22",
  category: {
    primaryCode: null,
    secondaryCode: null,
    status: "pending",
    mappingVersion: 1,
  },
  dataQuality: {
    sampleValid: true,
    klineRows: 22,
    firstKlineDate: "2025-01-01",
    lastKlineDate: "2025-01-22",
    amountSampleCount20d: 20,
    warnings: [],
  },
  features: {
    returns: {
      "1d": 0.008333333333,
      "5d": 0.043103448276,
      "20d": 0.19801980198,
      "60d": null,
      "120d": null,
      "250d": null,
      ytd: null,
    },
    trend: {
      close: 121,
      ma5: 119,
      ma10: 116.5,
      ma20: 111.5,
      ma60: null,
      ma120: null,
      ma20Deviation: 0.085201793722,
      ma60Deviation: null,
      aboveMa20: true,
      aboveMa60: null,
      aboveMa120: null,
      maAlignment: null,
      maAlignmentScore: null,
      boll20: {
        middle: 111.5,
        upper: 123.032562594671,
        lower: 99.967437405329,
        percentB: 0.911877235524,
        bandwidth: 0.206862109321,
      },
    },
    risk: {
      volatility20d: 0.007541751626,
      volatility60d: null,
      volatility120d: null,
      maxDrawdown20d: 0,
      maxDrawdown60d: null,
      maxDrawdown120d: null,
      maxDrawdown250d: null,
      currentDrawdown: 0,
      sampleHigh: 121,
      distanceFromSampleHigh: 0,
      maxDrawdown60dPeakDate: null,
      maxDrawdown60dTroughDate: null,
    },
    activity: {
      amount: 1210,
      averageAmount5d: 1190,
      averageAmount20d: 1115,
      averageAmount60d: null,
      amountRatio20d: 0.085201793722,
      amountRatio60d: null,
      amountSampleCount20d: 20,
    },
    valuation: {
      pe: {
        value: 12.5,
        historicalPercentile: 0.4,
        date: "2025-01-20",
        lagDays: 2,
        lagTradingDays: 2,
        peg: 1.2,
        pegUsable: true,
        source: "hongsehuojian",
        freshness: "fresh",
      },
      pb: {
        value: 1.3,
        historicalPercentile: 0.3,
        date: "2025-01-21",
        lagDays: 1,
        lagTradingDays: 1,
        peg: null,
        pegUsable: false,
        source: "hongsehuojian",
        freshness: "fresh",
      },
      ps: {
        value: 2.4,
        historicalPercentile: 0.6,
        date: "2025-01-22",
        lagDays: 0,
        lagTradingDays: 0,
        peg: null,
        pegUsable: false,
        source: "hongsehuojian",
        freshness: "fresh",
      },
    },
    history: {
      "1m": {
        tradingDays: 21,
        totalReturn: 0.21,
        annualizedReturn: 8.849732675808,
        meanDailyReturn: 0.009118608082,
        medianDailyReturn: 0.009090909091,
        dailyReturnStd: 0.000503786741,
        annualizedVolatility: 0.007997366576,
        maxDrawdown: 0,
        sharpe: 287.330737527213,
        sortino: null,
        calmar: null,
        maxUpStreak: 21,
        maxDownStreak: 0,
        newHighCount: 21,
        averageAmount: 1105,
        amountSampleCount: 22,
      },
      "3m": null,
      "6m": null,
      ytd: null,
      "1y": null,
      "2y": null,
    },
  },
  computedAt: COMPUTED_AT,
};

describe("calculateEtfFeatureFile", () => {
  it("assembles the complete golden feature file with a pending category", async () => {
    const result = calculateEtfFeatureFile(await goldenInput());
    expect(result).toEqual(GOLDEN_FEATURE_FILE);
    expect(result.category.status).toBe("pending");
    expect(result.dataQuality.sampleValid).toBe(true);
  });

  it("keeps history but nulls current metrics when the latest Kline is stale", async () => {
    const input = await goldenInput();
    input.klines = rowsFromCloses(
      Array.from({ length: 23 }, (_, index) => 78 + index),
      { start: "2024-12-30" },
    );

    const result = calculateEtfFeatureFile(input);

    expect(result.latestKlineDate).toBe("2025-01-21");
    expect(result.dataQuality).toMatchObject({
      sampleValid: false,
      klineRows: 23,
      firstKlineDate: "2024-12-30",
      lastKlineDate: "2025-01-21",
      amountSampleCount20d: 20,
      warnings: ["KLINE_STALE"],
    });
    expect(Object.values(result.features.returns).every((value) => value === null)).toBe(true);
    expect(result.features.trend.boll20).toEqual({
      middle: null,
      upper: null,
      lower: null,
      percentB: null,
      bandwidth: null,
    });
    expect(result.features.risk.sampleHigh).toBeNull();
    expect(result.features.activity).toMatchObject({
      amount: null,
      averageAmount5d: null,
      averageAmount20d: null,
      amountSampleCount20d: 20,
    });
    expect(result.features.history["1m"]).not.toBeNull();
  });

  it("handles an empty Kline with KLINE_EMPTY but still computes valuation", async () => {
    const input = await goldenInput();
    input.klines = [];
    input.valuations = [valuation("2025-01-22", "PE", 12.5, 0.4, 1.2)];

    const result = calculateEtfFeatureFile(input);

    expect(result.latestKlineDate).toBeNull();
    expect(result.dataQuality).toMatchObject({
      sampleValid: false,
      klineRows: 0,
      firstKlineDate: null,
      lastKlineDate: null,
      amountSampleCount20d: 0,
      warnings: ["KLINE_EMPTY"],
    });
    expect(result.features.returns["1d"]).toBeNull();
    expect(result.features.risk.sampleHigh).toBeNull();
    expect(result.features.history).toEqual({
      "1m": null,
      "3m": null,
      "6m": null,
      ytd: null,
      "1y": null,
      "2y": null,
    });
    expect(result.features.valuation.pe?.value).toBe(12.5);
  });

  it("filters future rows before calculating", async () => {
    const input = await goldenInput();
    input.klines = [...input.klines, makeKline("2025-01-23", 999, 9_999)];

    const result = calculateEtfFeatureFile(input);

    expect(result).toEqual(GOLDEN_FEATURE_FILE);
    expect(result.dataQuality.klineRows).toBe(22);
  });

  it("rejects duplicate Kline dates", async () => {
    const input = await goldenInput();
    input.klines = [...input.klines, makeKline("2025-01-22", 121, 1_210)];

    expect(() => calculateEtfFeatureFile(input)).toThrow("Duplicate Kline date");
  });

  it("is deterministic for identical inputs", async () => {
    const input = await goldenInput();
    const first = calculateEtfFeatureFile(input);
    const second = calculateEtfFeatureFile(input);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("returns null for missing valuation types", async () => {
    const input = await goldenInput();
    input.valuations = [valuation("2025-01-22", "PE", 12.5, 0.4)];

    const result = calculateEtfFeatureFile(input);

    expect(result.features.valuation.pe).not.toBeNull();
    expect(result.features.valuation.pb).toBeNull();
    expect(result.features.valuation.ps).toBeNull();
  });
});
