import type { CalculationConfig } from "../config/schemas.js";
import type { EtfFeatureFile } from "../domain/features.js";
import { marketRiskSchema, type MarketRisk, type RiskStats } from "../domain/market.js";
import { mean, median, roundTo } from "../calculations/math.js";
import type { RiskScoreValue } from "../rankings/risk-score.js";
import { distribution, ratio, rounded } from "./statistics.js";

export function calculateMarketRisk(
  features: readonly EtfFeatureFile[],
  analysisDate: string,
  config: CalculationConfig,
  riskScores: readonly RiskScoreValue[],
): MarketRisk {
  const volatility = numericValues(features.map((feature) => feature.features.risk.volatility20d));
  const drawdown = numericValues(features.map((feature) => feature.features.risk.maxDrawdown60d));
  const scores = numericValues(riskScores.map((item) => item.value));
  const highVolatilityCount = volatility.filter(
    (value) => value >= config.marketState.highVolatility20d,
  ).length;
  const highDrawdownCount = drawdown.filter(
    (value) => value <= config.marketState.highDrawdown60d,
  ).length;
  const highRiskCount = scores.filter((value) => value >= config.marketState.highRiskScore).length;

  const risk: RiskStats = {
    volatilityValidCount: volatility.length,
    meanVolatility20d: rounded(mean(volatility)),
    medianVolatility20d: rounded(median(volatility)),
    highVolatilityCount,
    highVolatilityRatio: ratio(highVolatilityCount, volatility.length),
    drawdownValidCount: drawdown.length,
    meanMaxDrawdown60d: rounded(mean(drawdown)),
    highDrawdownCount,
    highDrawdownRatio: ratio(highDrawdownCount, drawdown.length),
    riskScoreValidCount: scores.length,
    meanRiskScore: rounded(mean(scores)),
    highRiskCount,
    highRiskRatio: ratio(highRiskCount, scores.length),
    volatilityDistribution: distribution(volatility, config.distributionBins.volatility),
    drawdownDistribution: distribution(drawdown, config.distributionBins.drawdown),
  };

  return marketRiskSchema.parse({ schemaVersion: 1, analysisDate, risk });
}

function numericValues(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null).map((value) => roundTo(value));
}
