import { describe, expect, it } from "vitest";
import type { ActivityStats, ReturnStats, RiskStats, TrendStats } from "../../src/domain/market.js";
import { calculateMarketAnalysis } from "../../src/market/market-analysis.js";
import { calculateMarketState } from "../../src/market/state.js";
import { loadCalculationConfig } from "../calculations/support.js";
import { makeEtfLink, makeFeature } from "../support/features.js";

const ANALYSIS_DATE = "2026-11-13";

const BASE_RETURN: ReturnStats = {
  validCount: 10,
  mean: 0,
  median: 0,
  upCount: 5,
  downCount: 5,
  flatCount: 0,
  positiveRatio: 0.5,
  negativeRatio: 0.5,
  p10: -0.01,
  p25: -0.005,
  p75: 0.005,
  p90: 0.01,
  distribution: [],
};

const BASE_TREND: TrendStats = {
  validCount: 10,
  bullishCount: 5,
  bearishCount: 2,
  neutralCount: 3,
  bullishRatio: 0.5,
  bearishRatio: 0.2,
  neutralRatio: 0.3,
  aboveMa20ValidCount: 10,
  aboveMa20Count: 5,
  aboveMa20Ratio: 0.5,
  aboveMa60ValidCount: 10,
  aboveMa60Count: 5,
  aboveMa60Ratio: 0.5,
  aboveMa120ValidCount: 10,
  aboveMa120Count: 5,
  aboveMa120Ratio: 0.5,
};

const BASE_RISK: RiskStats = {
  volatilityValidCount: 10,
  meanVolatility20d: 0.1,
  medianVolatility20d: 0.1,
  highVolatilityCount: 0,
  highVolatilityRatio: 0,
  drawdownValidCount: 10,
  meanMaxDrawdown60d: -0.05,
  highDrawdownCount: 0,
  highDrawdownRatio: 0,
  riskScoreValidCount: 10,
  meanRiskScore: 0.3,
  highRiskCount: 0,
  highRiskRatio: 0,
  volatilityDistribution: [],
  drawdownDistribution: [],
};

const BASE_ACTIVITY: ActivityStats = {
  amountValidCount: 10,
  totalAmount: 1_000_000_000,
  meanAmount: 100_000_000,
  medianAmount: 100_000_000,
  ratioValidCount: 10,
  meanAmountRatio20d: 0.1,
  expandedCount: 0,
  expandedRatio: 0,
  amountDistribution: [],
};

async function state(overrides: {
  positiveRatio1d?: number;
  medianReturn20d?: number;
  aboveMa20Ratio?: number;
  meanVolatility20d?: number;
  p90Return20d?: number;
  p10Return20d?: number;
  meanAmountRatio20d?: number;
}) {
  const config = await loadCalculationConfig();
  return calculateMarketState({
    analysisDate: ANALYSIS_DATE,
    return1d: { ...BASE_RETURN, positiveRatio: overrides.positiveRatio1d ?? 0.5 },
    return20d: {
      ...BASE_RETURN,
      median: overrides.medianReturn20d ?? 0,
      p90: overrides.p90Return20d ?? 0.01,
      p10: overrides.p10Return20d ?? -0.01,
    },
    trend: { ...BASE_TREND, aboveMa20Ratio: overrides.aboveMa20Ratio ?? 0.5 },
    risk: { ...BASE_RISK, meanVolatility20d: overrides.meanVolatility20d ?? 0.1 },
    activity: {
      ...BASE_ACTIVITY,
      meanAmountRatio20d: overrides.meanAmountRatio20d ?? 0.1,
    },
    config,
  });
}

describe("calculateMarketState", () => {
  it("matches risk_rising before weak", async () => {
    const result = await state({ positiveRatio1d: 0.3, meanVolatility20d: 0.3 });
    expect(result).toMatchObject({
      code: "risk_rising",
      label: "风险上升",
      matchedRule: "risk_rising",
      evidence: { positiveRatio1d: 0.3, meanVolatility20d: 0.3 },
    });
    expect(result.thresholds.highVolatility20d).toBe(0.28);
  });

  it("matches weak on breadth", async () => {
    expect((await state({ positiveRatio1d: 0.3 })).code).toBe("weak");
  });

  it("matches strong when breadth, returns, and trend all qualify", async () => {
    const result = await state({
      positiveRatio1d: 0.7,
      medianReturn20d: 0.03,
      aboveMa20Ratio: 0.7,
    });
    expect(result).toMatchObject({ code: "strong", label: "整体偏强" });
  });

  it("matches diverging when dispersion is high and breadth is mixed", async () => {
    const result = await state({
      positiveRatio1d: 0.5,
      p90Return20d: 0.1,
      p10Return20d: -0.05,
    });
    expect(result).toMatchObject({ code: "diverging", label: "震荡分化" });
  });

  it("matches activity_improving after higher-priority states fail", async () => {
    const result = await state({ positiveRatio1d: 0.55, meanAmountRatio20d: 0.3 });
    expect(result).toMatchObject({ code: "activity_improving", label: "成交活跃度改善" });
  });

  it("falls back to neutral", async () => {
    expect((await state({})).code).toBe("neutral");
  });
});

describe("calculateMarketAnalysis", () => {
  it("assembles sample coverage, statistics, and state deterministically", async () => {
    const config = await loadCalculationConfig();
    const features = Array.from({ length: 6 }, (_, index) =>
      makeFeature({
        code: `ETF${index}`,
        returns: { "1d": 0.01, "20d": 0.03 },
        trend: { aboveMa20: true, maAlignment: "bullish" },
        risk: { volatility20d: 0.1, maxDrawdown60d: -0.01 },
        activity: { amount: 100_000_000, amountRatio20d: 0.1 },
      }),
    );
    const etfs = features.map((feature, index) => makeEtfLink(feature.code, `IDX${index}.SH`));

    const result = calculateMarketAnalysis({
      features,
      etfs,
      analysisDate: ANALYSIS_DATE,
      config,
    });

    expect(result.samples).toMatchObject({
      poolCount: 6,
      klineValidCount: 6,
      uniqueIndexCount: 6,
      staleEtfCodes: [],
    });
    expect(result.returns.returns["1d"]).toMatchObject({
      validCount: 6,
      positiveRatio: 1,
    });
    expect(result.state).toMatchObject({ code: "strong", label: "整体偏强" });
  });
});
