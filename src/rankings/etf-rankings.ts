import type { CalculationConfig } from "../config/schemas.js";
import type { EtfFeatureFile } from "../domain/features.js";
import {
  rankingFileSchema,
  type RankingCode,
  type RankingDirection,
  type RankingFile,
  type RankingInterpretation,
} from "../domain/rankings.js";
import { rankValues, type RankableValue } from "./rank-values.js";
import { calculateRiskScores } from "./risk-score.js";

export interface CalculateEtfRankingsInput {
  features: readonly EtfFeatureFile[];
  analysisDate: string;
  snapshotVersion: number;
  config: CalculationConfig;
}

interface RankingSpec {
  code: RankingCode;
  direction: RankingDirection;
  interpretation: RankingInterpretation;
  values: (features: readonly EtfFeatureFile[], config: CalculationConfig) => RankableValue[];
}

const RETURN_SPECS: readonly {
  code: RankingCode;
  key: "1d" | "5d" | "20d" | "60d" | "120d" | "250d" | "ytd";
}[] = [
  { code: "return_1d", key: "1d" },
  { code: "return_5d", key: "5d" },
  { code: "return_20d", key: "20d" },
  { code: "return_60d", key: "60d" },
  { code: "return_120d", key: "120d" },
  { code: "return_250d", key: "250d" },
  { code: "return_ytd", key: "ytd" },
];

const SPECS: readonly RankingSpec[] = [
  ...RETURN_SPECS.map(({ code, key }) => ({
    code,
    direction: "desc" as const,
    interpretation: "higher_is_better" as const,
    values: (features: readonly EtfFeatureFile[]) =>
      features.map((feature) => ({ code: feature.code, value: feature.features.returns[key] })),
  })),
  {
    code: "trend_score",
    direction: "desc",
    interpretation: "higher_is_better",
    values: (features) =>
      features.map((feature) => ({
        code: feature.code,
        value: feature.features.trend.maAlignmentScore,
      })),
  },
  {
    code: "risk_score",
    direction: "asc",
    interpretation: "lower_is_better",
    values: (features, config) =>
      calculateRiskScores(features, config).map((item) => ({
        code: item.code,
        value: item.value,
      })),
  },
  {
    code: "activity_amount_20d",
    direction: "desc",
    interpretation: "higher_is_better",
    values: (features) =>
      features.map((feature) => ({
        code: feature.code,
        value: feature.features.activity.averageAmount20d,
      })),
  },
  {
    code: "valuation_pe",
    direction: "asc",
    interpretation: "neutral",
    values: (features) =>
      features.map((feature) => ({
        code: feature.code,
        value: feature.features.valuation.pe?.historicalPercentile ?? null,
      })),
  },
  {
    code: "valuation_pb",
    direction: "asc",
    interpretation: "neutral",
    values: (features) =>
      features.map((feature) => ({
        code: feature.code,
        value: feature.features.valuation.pb?.historicalPercentile ?? null,
      })),
  },
  {
    code: "valuation_ps",
    direction: "asc",
    interpretation: "neutral",
    values: (features) =>
      features.map((feature) => ({
        code: feature.code,
        value: feature.features.valuation.ps?.historicalPercentile ?? null,
      })),
  },
];

export function calculateEtfRankings(
  input: CalculateEtfRankingsInput,
): Record<RankingCode, RankingFile> {
  validateFeatures(input.features, input.analysisDate);

  const entries = SPECS.map((spec) => {
    const ranking = rankValues(spec.values(input.features, input.config), {
      direction: spec.direction,
      minSample: input.config.ranking.minSample,
      tieTolerance: input.config.ranking.tieTolerance,
    });
    const file = rankingFileSchema.parse({
      schemaVersion: 1,
      rankingCode: spec.code,
      analysisDate: input.analysisDate,
      snapshotVersion: input.snapshotVersion,
      direction: spec.direction,
      interpretation: spec.interpretation,
      totalCount: input.features.length,
      eligibleCount: ranking.validCount,
      insufficientSample: ranking.insufficientSample,
      minSample: input.config.ranking.minSample,
      items: ranking.items,
    });
    return [spec.code, file] as const;
  });

  return Object.fromEntries(entries) as Record<RankingCode, RankingFile>;
}

function validateFeatures(features: readonly EtfFeatureFile[], analysisDate: string): void {
  const codes = new Set<string>();
  for (const feature of features) {
    if (feature.analysisDate !== analysisDate) {
      throw new Error(
        `Feature ${feature.code} analysisDate ${feature.analysisDate} does not match ${analysisDate}`,
      );
    }
    if (codes.has(feature.code)) {
      throw new Error(`Duplicate feature code: ${feature.code}`);
    }
    codes.add(feature.code);
  }
}
