import type { CalculationConfig } from "../config/schemas.js";
import type { Etf } from "../domain/etf.js";
import type { EtfFeatureFile } from "../domain/features.js";
import type {
  MarketActivity,
  MarketReturns,
  MarketRisk,
  MarketSampleSummary,
  MarketState,
  MarketTrend,
  MarketValuation,
} from "../domain/market.js";
import { calculateRiskScores } from "../rankings/risk-score.js";
import { calculateMarketActivity } from "./activity.js";
import { calculateMarketReturns } from "./returns.js";
import { calculateMarketRisk } from "./risk.js";
import { calculateMarketState } from "./state.js";
import { calculateMarketTrend } from "./trend.js";
import { calculateMarketValuation } from "./valuation.js";

export interface CalculateMarketAnalysisInput {
  features: readonly EtfFeatureFile[];
  etfs: readonly Pick<Etf, "code" | "trackIndex">[];
  analysisDate: string;
  config: CalculationConfig;
}

export interface MarketAnalysis {
  samples: MarketSampleSummary;
  returns: MarketReturns;
  trend: MarketTrend;
  risk: MarketRisk;
  activity: MarketActivity;
  valuation: MarketValuation;
  state: MarketState;
}

export function calculateMarketAnalysis(input: CalculateMarketAnalysisInput): MarketAnalysis {
  validateAnalysisDate(input.features, input.analysisDate);
  const returns = calculateMarketReturns(input.features, input.analysisDate, input.config);
  const trend = calculateMarketTrend(input.features, input.analysisDate);
  const riskScores = calculateRiskScores(input.features, input.config);
  const risk = calculateMarketRisk(input.features, input.analysisDate, input.config, riskScores);
  const activity = calculateMarketActivity(input.features, input.analysisDate);
  const valuationAnalysis = calculateMarketValuation(
    input.features,
    input.etfs,
    input.analysisDate,
    input.config,
  );
  const state = calculateMarketState({
    analysisDate: input.analysisDate,
    return1d: returns.returns["1d"],
    return20d: returns.returns["20d"],
    trend: trend.trend,
    risk: risk.risk,
    activity: activity.activity,
    config: input.config,
  });

  return {
    samples: valuationAnalysis.samples,
    returns,
    trend,
    risk,
    activity,
    valuation: valuationAnalysis.valuation,
    state,
  };
}

function validateAnalysisDate(features: readonly EtfFeatureFile[], analysisDate: string): void {
  for (const feature of features) {
    if (feature.analysisDate !== analysisDate) {
      throw new Error(
        `Feature ${feature.code} analysisDate ${feature.analysisDate} does not match ${analysisDate}`,
      );
    }
  }
}
