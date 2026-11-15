import type { z } from "zod";
import type { CalculationConfig, categoriesConfigSchema } from "../config/schemas.js";
import type { RankingCategoryFilter } from "../rankings/filtered-ranking.js";
import { calculateFilteredRanking } from "../rankings/filtered-ranking.js";
import { RANKING_CODES, type RankingCode } from "../domain/rankings.js";
import type { EtfFeatureFile } from "../domain/features.js";
import type { SnapshotData } from "../snapshots/snapshot-reader.js";
import { ApiError } from "./errors.js";
import { invalid } from "./query.js";

export type CategoryConfig = z.infer<typeof categoriesConfigSchema>;

export interface EtfListQuery {
  page: number;
  pageSize: number;
  sort: RankingCode;
  order?: "asc" | "desc";
  q?: string;
  category?: string;
  subcategory?: string;
}

export interface EtfListItem {
  code: string;
  name: string;
  exchange: string;
  category: EtfFeatureFile["category"];
  dataQuality: EtfFeatureFile["dataQuality"];
  returns: EtfFeatureFile["features"]["returns"];
  trend: {
    ma20Deviation: number | null;
    maAlignment: EtfFeatureFile["features"]["trend"]["maAlignment"];
    maAlignmentScore: number | null;
  };
  risk: {
    volatility20d: number | null;
    currentDrawdown: number | null;
  };
  activity: {
    averageAmount20d: number | null;
    amountRatio20d: number | null;
  };
  valuation: {
    pePercentile: number | null;
    peLagDays: number | null;
    pbPercentile: number | null;
    pbLagDays: number | null;
    psPercentile: number | null;
    psLagDays: number | null;
  };
  ranks: Partial<Record<RankingCode, { rank: number; percentile: number; filteredRank?: number }>>;
}

export interface EtfListResult {
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
  rankingCode: RankingCode;
  order: "asc" | "desc";
  items: EtfListItem[];
}

export function queryEtfList(
  data: SnapshotData,
  categories: CategoryConfig,
  calculation: CalculationConfig,
  query: EtfListQuery,
): EtfListResult {
  validateCategoryQuery(categories, query.category, query.subcategory);
  const filter = filterFromQuery(query.category, query.subcategory);
  const filteredFeatures = [...data.features.values()]
    .filter((feature) => matchesCategory(feature, filter))
    .filter((feature) => matchesSearch(feature, query.q));
  const ranking = data.rankings[query.sort];
  const fullPoolRank = rankMap(data, query.sort);
  const filteredRanking =
    filter === null
      ? null
      : calculateFilteredRanking({
          features: [...data.features.values()].filter((feature) =>
            matchesCategory(feature, filter),
          ),
          rankingCode: query.sort,
          analysisDate: data.analysisDate,
          snapshotVersion: data.snapshotVersion,
          config: calculation,
          filter,
        });
  const filteredRank = new Map(
    filteredRanking?.filtered.items.map((item) => [item.code, item.filteredRank]) ?? [],
  );
  const requestedOrder = query.order ?? ranking.direction;
  const rankAscending = requestedOrder === ranking.direction;

  const sorted = [...filteredFeatures].sort((left, right) => {
    const leftRank = fullPoolRank.get(left.code) ?? null;
    const rightRank = fullPoolRank.get(right.code) ?? null;
    if (leftRank !== rightRank) {
      if (leftRank === null) {
        return 1;
      }
      if (rightRank === null) {
        return -1;
      }
      return rankAscending ? leftRank - rightRank : rightRank - leftRank;
    }
    return left.code.localeCompare(right.code);
  });
  const start = (query.page - 1) * query.pageSize;
  const items = sorted
    .slice(start, start + query.pageSize)
    .map((feature) => toEtfListItem(feature, data, query.sort, filteredRank));

  return {
    total: data.features.size,
    filteredTotal: sorted.length,
    page: query.page,
    pageSize: query.pageSize,
    rankingCode: query.sort,
    order: requestedOrder,
    items,
  };
}

export function queryRanking(
  data: SnapshotData,
  categories: CategoryConfig,
  calculation: CalculationConfig,
  rankingCode: RankingCode,
  query: { category?: string; subcategory?: string; page: number; pageSize: number },
) {
  validateCategoryQuery(categories, query.category, query.subcategory);
  const filter = filterFromQuery(query.category, query.subcategory);
  const full = data.rankings[rankingCode];
  if (filter === null) {
    const start = (query.page - 1) * query.pageSize;
    return {
      scope: "full" as const,
      rankingCode,
      analysisDate: data.analysisDate,
      snapshotVersion: data.snapshotVersion,
      direction: full.direction,
      interpretation: full.interpretation,
      totalCount: full.totalCount,
      eligibleCount: full.eligibleCount,
      insufficientSample: full.insufficientSample,
      minSample: full.minSample,
      total: full.items.length,
      page: query.page,
      pageSize: query.pageSize,
      items: full.items.slice(start, start + query.pageSize),
    };
  }

  const filtered = calculateFilteredRanking({
    features: [...data.features.values()].filter((feature) => matchesCategory(feature, filter)),
    rankingCode,
    analysisDate: data.analysisDate,
    snapshotVersion: data.snapshotVersion,
    config: calculation,
    filter,
  });
  const start = (query.page - 1) * query.pageSize;
  return {
    ...filtered,
    total: filtered.filtered.items.length,
    page: query.page,
    pageSize: query.pageSize,
    items: filtered.filtered.items.slice(start, start + query.pageSize),
  };
}

export function etfDetail(data: SnapshotData, code: string) {
  const feature = data.features.get(code);
  if (feature === undefined) {
    throw new ApiError("ETF_NOT_FOUND", 404, `ETF not found in snapshot: ${code}`, { code });
  }
  return {
    ...feature,
    ranks: buildRanks(data, code),
    findings: data.findings.etfs.items.filter((finding) => finding.etfCode === code),
  };
}

function toEtfListItem(
  feature: EtfFeatureFile,
  data: SnapshotData,
  rankingCode: RankingCode,
  filteredRank: ReadonlyMap<string, number>,
): EtfListItem {
  const ranks = buildRanks(data, feature.code) as EtfListItem["ranks"];
  const selected = ranks[rankingCode];
  const selectedFilteredRank = filteredRank.get(feature.code);
  if (selected !== undefined && selectedFilteredRank !== undefined) {
    selected.filteredRank = selectedFilteredRank;
  }
  return {
    code: feature.code,
    name: feature.name,
    exchange: feature.exchange,
    category: feature.category,
    dataQuality: feature.dataQuality,
    returns: feature.features.returns,
    trend: {
      ma20Deviation: feature.features.trend.ma20Deviation,
      maAlignment: feature.features.trend.maAlignment,
      maAlignmentScore: feature.features.trend.maAlignmentScore,
    },
    risk: {
      volatility20d: feature.features.risk.volatility20d,
      currentDrawdown: feature.features.risk.currentDrawdown,
    },
    activity: {
      averageAmount20d: feature.features.activity.averageAmount20d,
      amountRatio20d: feature.features.activity.amountRatio20d,
    },
    valuation: {
      pePercentile: feature.features.valuation.pe?.historicalPercentile ?? null,
      peLagDays: feature.features.valuation.pe?.lagDays ?? null,
      pbPercentile: feature.features.valuation.pb?.historicalPercentile ?? null,
      pbLagDays: feature.features.valuation.pb?.lagDays ?? null,
      psPercentile: feature.features.valuation.ps?.historicalPercentile ?? null,
      psLagDays: feature.features.valuation.ps?.lagDays ?? null,
    },
    ranks,
  };
}

function buildRanks(data: SnapshotData, code: string) {
  const result: Partial<Record<RankingCode, { rank: number; percentile: number }>> = {};
  for (const rankingCode of RANKING_CODES) {
    const item = data.rankings[rankingCode].items.find((entry) => entry.code === code);
    if (item !== undefined) {
      result[rankingCode] = { rank: item.rank, percentile: item.percentile };
    }
  }
  return result;
}

function rankMap(data: SnapshotData, rankingCode: RankingCode): Map<string, number> {
  return new Map(data.rankings[rankingCode].items.map((item) => [item.code, item.rank]));
}

function matchesSearch(feature: EtfFeatureFile, search: string | undefined): boolean {
  if (search === undefined) {
    return true;
  }
  const lower = search.toLowerCase();
  return feature.code.toLowerCase().includes(lower) || feature.name.toLowerCase().includes(lower);
}

function matchesCategory(feature: EtfFeatureFile, filter: RankingCategoryFilter | null): boolean {
  if (filter === null) {
    return true;
  }
  if (
    filter.status !== undefined &&
    filter.status !== null &&
    feature.category.status !== filter.status
  ) {
    return false;
  }
  if (filter.primaryCode !== null && feature.category.primaryCode !== filter.primaryCode) {
    return false;
  }
  if (filter.secondaryCode !== null && feature.category.secondaryCode !== filter.secondaryCode) {
    return false;
  }
  return true;
}

function filterFromQuery(
  category: string | undefined,
  subcategory: string | undefined,
): RankingCategoryFilter | null {
  if (category === undefined && subcategory === undefined) {
    return null;
  }
  if (category === "pending" || category === "confirmed") {
    return {
      primaryCode: null,
      secondaryCode: subcategory ?? null,
      status: category,
    };
  }
  return {
    primaryCode: category ?? null,
    secondaryCode: subcategory ?? null,
  };
}

function validateCategoryQuery(
  categories: CategoryConfig,
  category: string | undefined,
  subcategory: string | undefined,
): void {
  if (category === undefined) {
    if (subcategory !== undefined) {
      const found = categories.categories.some((item) =>
        item.children.some((child) => child.code === subcategory),
      );
      if (!found) {
        throw invalid(`Unknown subcategory: ${subcategory}`);
      }
    }
    return;
  }
  if (category === "pending" || category === "confirmed") {
    if (
      subcategory !== undefined &&
      !categories.categories.some((item) =>
        item.children.some((child) => child.code === subcategory),
      )
    ) {
      throw invalid(`Unknown subcategory: ${subcategory}`);
    }
    return;
  }
  const primary = categories.categories.find((item) => item.code === category);
  if (primary === undefined) {
    throw invalid(`Unknown category: ${category}`);
  }
  if (subcategory !== undefined && !primary.children.some((child) => child.code === subcategory)) {
    throw invalid(`Unknown subcategory ${subcategory} under ${category}`);
  }
}
