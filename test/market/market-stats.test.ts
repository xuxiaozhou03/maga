import { describe, expect, it } from "vitest";
import { calculateMarketActivity } from "../../src/market/activity.js";
import { calculateMarketReturns } from "../../src/market/returns.js";
import { calculateMarketRisk } from "../../src/market/risk.js";
import { calculateMarketTrend } from "../../src/market/trend.js";
import { calculateMarketValuation } from "../../src/market/valuation.js";
import { loadCalculationConfig } from "../calculations/support.js";
import { makeEtfLink, makeFeature, makeValuation } from "../support/features.js";

const ANALYSIS_DATE = "2026-11-13";

describe("calculateMarketReturns", () => {
  it("uses its own valid denominator and leaves quantiles null below five samples", async () => {
    const config = await loadCalculationConfig();
    const values = [0.04, 0.03, 0.02, 0.01, 0];
    const features = values.map((value, index) =>
      makeFeature({ code: `ETF${index}`, returns: { "1d": value } }),
    );
    features.push(
      makeFeature({ code: "ETF-LONG-1", returns: { "250d": 0.1 } }),
      makeFeature({ code: "ETF-LONG-2", returns: { "250d": 0.2 } }),
      makeFeature({ code: "ETF-LONG-3", returns: { "250d": 0.3 } }),
    );

    const result = calculateMarketReturns(features, ANALYSIS_DATE, config);

    expect(result.returns["1d"]).toMatchObject({
      validCount: 5,
      mean: 0.02,
      median: 0.02,
      upCount: 4,
      downCount: 0,
      flatCount: 1,
      positiveRatio: 0.8,
      negativeRatio: 0,
      p10: 0.004,
      p25: 0.01,
      p75: 0.03,
      p90: 0.036,
    });
    expect(result.returns["1d"].distribution).toEqual([
      { lower: -1, upper: -0.03, count: 0 },
      { lower: -0.03, upper: -0.01, count: 0 },
      { lower: -0.01, upper: 0, count: 0 },
      { lower: 0, upper: 0.01, count: 1 },
      { lower: 0.01, upper: 0.03, count: 2 },
      { lower: 0.03, upper: 1, count: 2 },
    ]);
    expect(result.returns["250d"]).toMatchObject({
      validCount: 3,
      p10: null,
      p90: null,
      distribution: [],
    });
  });
});

describe("calculateMarketTrend", () => {
  it("uses separate denominators for alignment and moving-average position", async () => {
    const features = [
      makeFeature({
        code: "A",
        trend: { maAlignment: "bullish", aboveMa20: true, aboveMa60: true },
      }),
      makeFeature({
        code: "B",
        trend: { maAlignment: "bullish", aboveMa20: false, aboveMa60: null },
      }),
      makeFeature({
        code: "C",
        trend: { maAlignment: "bearish", aboveMa20: true, aboveMa60: null },
      }),
      makeFeature({
        code: "D",
        trend: { maAlignment: "neutral", aboveMa20: null, aboveMa60: null },
      }),
      makeFeature({
        code: "E",
        trend: { maAlignment: null, aboveMa20: true, aboveMa60: null },
      }),
    ];

    const result = calculateMarketTrend(features, ANALYSIS_DATE);

    expect(result.trend).toMatchObject({
      validCount: 4,
      bullishCount: 2,
      bearishCount: 1,
      neutralCount: 1,
      bullishRatio: 0.5,
      bearishRatio: 0.25,
      neutralRatio: 0.25,
      aboveMa20ValidCount: 4,
      aboveMa20Count: 3,
      aboveMa20Ratio: 0.75,
      aboveMa60ValidCount: 1,
      aboveMa60Count: 1,
      aboveMa60Ratio: 1,
      aboveMa120ValidCount: 0,
      aboveMa120Ratio: null,
    });
  });
});

describe("calculateMarketRisk", () => {
  it("uses independent volatility, drawdown, and risk-score denominators", async () => {
    const config = await loadCalculationConfig();
    const features = [
      makeFeature({ code: "A", risk: { volatility20d: 0.1, maxDrawdown60d: -0.01 } }),
      makeFeature({ code: "B", risk: { volatility20d: 0.2, maxDrawdown60d: -0.1 } }),
      makeFeature({ code: "C", risk: { volatility20d: 0.3, maxDrawdown60d: -0.2 } }),
      makeFeature({ code: "D", risk: { volatility20d: null, maxDrawdown60d: -0.3 } }),
      makeFeature({ code: "E", risk: { volatility20d: null, maxDrawdown60d: null } }),
    ];

    const result = calculateMarketRisk(features, ANALYSIS_DATE, config, [
      { code: "A", value: 0.1 },
      { code: "B", value: 0.5 },
      { code: "C", value: 0.8 },
      { code: "D", value: 0.9 },
    ]);

    expect(result.risk).toMatchObject({
      volatilityValidCount: 3,
      meanVolatility20d: 0.2,
      medianVolatility20d: 0.2,
      highVolatilityCount: 1,
      highVolatilityRatio: 0.333333333333,
      drawdownValidCount: 4,
      meanMaxDrawdown60d: -0.1525,
      highDrawdownCount: 2,
      highDrawdownRatio: 0.5,
      riskScoreValidCount: 4,
      meanRiskScore: 0.575,
      highRiskCount: 2,
      highRiskRatio: 0.5,
    });
  });
});

describe("calculateMarketActivity", () => {
  it("summarizes amounts and expansion with separate valid counts", () => {
    const features = [
      makeFeature({
        code: "A",
        activity: { amount: 10_000_000, amountRatio20d: 0.6 },
      }),
      makeFeature({
        code: "B",
        activity: { amount: 100_000_000, amountRatio20d: 0.4 },
      }),
      makeFeature({ code: "C", activity: { amount: null, amountRatio20d: 0.5 } }),
      makeFeature({
        code: "D",
        activity: { amount: 1_000_000_000, amountRatio20d: null },
      }),
      makeFeature({
        code: "E",
        activity: { amount: 5_000_000_000, amountRatio20d: 0.2 },
      }),
    ];

    const result = calculateMarketActivity(features, ANALYSIS_DATE);

    expect(result.activity).toMatchObject({
      amountValidCount: 4,
      totalAmount: 6_110_000_000,
      meanAmount: 1_527_500_000,
      medianAmount: 550_000_000,
      ratioValidCount: 4,
      meanAmountRatio20d: 0.425,
      expandedCount: 2,
      expandedRatio: 0.5,
    });
  });
});

describe("calculateMarketValuation", () => {
  it("deduplicates by unique index and applies coverage thresholds", async () => {
    const config = await loadCalculationConfig();
    const features = [];
    const etfs = [];

    for (let index = 0; index < 10; index += 1) {
      const code = `ETF${index}`;
      const trackIndex = `IDX${index}.SH`;
      const tooStale = index === 9;
      features.push(
        makeFeature({
          code,
          valuation: {
            pe: makeValuation(
              (index + 1) / 10,
              tooStale ? config.valuationFreshness.maxUsableDays + 1 : 0,
              tooStale ? "too_stale" : "fresh",
            ),
            pb: index < 4 ? makeValuation((index + 1) / 10) : null,
          },
        }),
      );
      etfs.push(makeEtfLink(code, trackIndex));
    }

    features.push(
      makeFeature({
        code: "Z-DUP",
        valuation: { pe: makeValuation(0.9) },
      }),
      makeFeature({
        code: "ETF10",
        sampleValid: false,
      }),
    );
    etfs.push(makeEtfLink("Z-DUP", "IDX0.SH"), makeEtfLink("ETF10", "IDX10.SH"));

    const result = calculateMarketValuation(features, etfs, ANALYSIS_DATE, config);

    expect(result.valuation.valuation.pe).toMatchObject({
      validCount: 9,
      validEtfCount: 10,
      coverageRatio: 0.818181818182,
      etfCoverageRatio: 0.833333333333,
      medianPercentile: 0.5,
      lowCount: 2,
      highCount: 2,
      staleCount: 0,
      tooStaleCount: 1,
      insufficientSample: false,
    });
    expect(result.valuation.valuation.pb).toMatchObject({
      validCount: 4,
      coverageRatio: 0.363636363636,
      medianPercentile: null,
      insufficientSample: true,
    });
    expect(result.valuation.valuation.ps).toMatchObject({
      validCount: 0,
      insufficientSample: true,
    });
    expect(result.samples).toEqual({
      poolCount: 12,
      klineValidCount: 11,
      uniqueIndexCount: 11,
      valuationValidIndexCount: 9,
      valuationValidEtfCount: 10,
      staleEtfCodes: ["ETF10"],
      valuationUnsupportedIndexes: ["IDX10.SH"],
    });
  });
});
