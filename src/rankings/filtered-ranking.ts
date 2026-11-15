import type { CalculationConfig } from "../config/schemas.js";
import type { CategoryAssignment, EtfFeatureFile } from "../domain/features.js";
import {
  filteredRankingSchema,
  type FilteredRanking,
  type RankingCode,
  type RankingFile,
} from "../domain/rankings.js";
import { calculateEtfRankings } from "./etf-rankings.js";

export interface RankingCategoryFilter {
  primaryCode: string | null;
  secondaryCode: string | null;
  status?: "pending" | "confirmed" | null;
}

export interface CalculateFilteredRankingInput {
  features: readonly EtfFeatureFile[];
  rankingCode: RankingCode;
  analysisDate: string;
  snapshotVersion: number;
  config: CalculationConfig;
  filter: RankingCategoryFilter;
}

export function calculateFilteredRanking(input: CalculateFilteredRankingInput): FilteredRanking {
  const fullPool = calculateEtfRankings(input)[input.rankingCode];
  const filteredFeatures = input.features.filter((feature) =>
    matchesFilter(feature.category, input.filter),
  );
  const filtered = calculateEtfRankings({ ...input, features: filteredFeatures })[
    input.rankingCode
  ];
  const fullPoolRanks = rankMap(fullPool);

  return filteredRankingSchema.parse({
    schemaVersion: 1,
    scope: "filtered",
    analysisDate: input.analysisDate,
    rankingCode: input.rankingCode,
    filter: input.filter,
    fullPool: {
      rankingCode: fullPool.rankingCode,
      eligibleCount: fullPool.eligibleCount,
      insufficientSample: fullPool.insufficientSample,
    },
    filtered: {
      eligibleCount: filtered.eligibleCount,
      insufficientSample: filtered.insufficientSample,
      items: filtered.items.map((item) => ({
        filteredRank: item.rank,
        code: item.code,
        value: item.value,
        percentile: item.percentile,
        fullPoolRank: fullPoolRanks.get(item.code) ?? null,
      })),
    },
  });
}

function matchesFilter(category: CategoryAssignment, filter: RankingCategoryFilter): boolean {
  if (filter.status !== undefined && filter.status !== null && category.status !== filter.status) {
    return false;
  }
  if (filter.primaryCode !== null && category.primaryCode !== filter.primaryCode) {
    return false;
  }
  if (filter.secondaryCode !== null && category.secondaryCode !== filter.secondaryCode) {
    return false;
  }
  return true;
}

function rankMap(file: RankingFile): Map<string, number> {
  return new Map(file.items.map((item) => [item.code, item.rank]));
}
