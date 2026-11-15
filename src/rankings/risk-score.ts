import type { CalculationConfig } from "../config/schemas.js";
import type { EtfFeatureFile } from "../domain/features.js";
import { roundTo } from "../calculations/math.js";
import { percentileRankValues, type RankableValue } from "./rank-values.js";

export interface RiskScoreValue {
  code: string;
  value: number;
}

export function calculateRiskScores(
  features: readonly EtfFeatureFile[],
  config: CalculationConfig,
): RiskScoreValue[] {
  const volatility = features.map((feature) => ({
    code: feature.code,
    value: feature.features.risk.volatility20d,
  }));
  const drawdown = features.map((feature) => ({
    code: feature.code,
    value:
      feature.features.risk.maxDrawdown60d === null
        ? null
        : Math.abs(feature.features.risk.maxDrawdown60d),
  }));

  const volatilityPercentiles = percentileByCode(volatility, config);
  const drawdownPercentiles = percentileByCode(drawdown, config);
  const scores: RiskScoreValue[] = [];

  for (const feature of features) {
    const volatilityPercentile = volatilityPercentiles.get(feature.code);
    const drawdownPercentile = drawdownPercentiles.get(feature.code);
    if (volatilityPercentile === undefined || drawdownPercentile === undefined) {
      continue;
    }
    scores.push({
      code: feature.code,
      value: roundTo((volatilityPercentile + drawdownPercentile) / 2),
    });
  }

  return scores.sort((left, right) => left.code.localeCompare(right.code));
}

function percentileByCode(
  values: readonly RankableValue[],
  config: CalculationConfig,
): Map<string, number> {
  return percentileRankValues(values, config.ranking.tieTolerance);
}
