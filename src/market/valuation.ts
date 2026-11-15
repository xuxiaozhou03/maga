import type { CalculationConfig } from "../config/schemas.js";
import type { Etf } from "../domain/etf.js";
import type { EtfFeatureFile, ValuationFeature } from "../domain/features.js";
import {
  marketSampleSummarySchema,
  marketValuationSchema,
  type MarketSampleSummary,
  type MarketValuation,
  type ValuationTypeStats,
} from "../domain/market.js";
import { median, roundTo } from "../calculations/math.js";
import { distribution, ratio, rounded } from "./statistics.js";

type ValuationKey = "pe" | "pb" | "ps";

export const VALUATION_LOW_PERCENTILE = 0.2;
export const VALUATION_HIGH_PERCENTILE = 0.8;
export const VALUATION_PERCENTILE_BINS = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;

export interface MarketValuationAnalysis {
  valuation: MarketValuation;
  samples: MarketSampleSummary;
}

export function calculateMarketValuation(
  features: readonly EtfFeatureFile[],
  etfs: readonly Pick<Etf, "code" | "trackIndex">[],
  analysisDate: string,
  config: CalculationConfig,
): MarketValuationAnalysis {
  const trackIndexByCode = new Map(etfs.map((etf) => [etf.code, etf.trackIndex]));
  const uniqueIndexes = [...new Set(etfs.map((etf) => etf.trackIndex))].sort();
  const linkedFeatures = new Map<string, EtfFeatureFile[]>();
  for (const feature of features) {
    const trackIndex = trackIndexByCode.get(feature.code);
    if (trackIndex === undefined) {
      continue;
    }
    const linked = linkedFeatures.get(trackIndex) ?? [];
    linked.push(feature);
    linkedFeatures.set(trackIndex, linked);
  }
  for (const linked of linkedFeatures.values()) {
    linked.sort((left, right) => left.code.localeCompare(right.code));
  }

  const selections = {
    pe: selectByIndex(uniqueIndexes, linkedFeatures, "pe"),
    pb: selectByIndex(uniqueIndexes, linkedFeatures, "pb"),
    ps: selectByIndex(uniqueIndexes, linkedFeatures, "ps"),
  };
  const valuation = marketValuationSchema.parse({
    schemaVersion: 1,
    analysisDate,
    valuation: {
      pe: calculateTypeStats(selections.pe, features, trackIndexByCode, uniqueIndexes, config),
      pb: calculateTypeStats(selections.pb, features, trackIndexByCode, uniqueIndexes, config),
      ps: calculateTypeStats(selections.ps, features, trackIndexByCode, uniqueIndexes, config),
    },
  });

  const validIndexes = new Set<string>();
  for (const selected of [...selections.pe, ...selections.pb, ...selections.ps]) {
    if (selected.item.lagDays <= config.valuationFreshness.maxUsableDays) {
      validIndexes.add(selected.trackIndex);
    }
  }
  const unsupportedIndexes = uniqueIndexes.filter(
    (index) =>
      ![...selections.pe, ...selections.pb, ...selections.ps].some(
        (selected) => selected.trackIndex === index,
      ),
  );
  const samples = marketSampleSummarySchema.parse({
    poolCount: features.length,
    klineValidCount: features.filter((feature) => feature.dataQuality.sampleValid).length,
    uniqueIndexCount: uniqueIndexes.length,
    valuationValidIndexCount: validIndexes.size,
    valuationValidEtfCount: features.filter((feature) => {
      const trackIndex = trackIndexByCode.get(feature.code);
      return trackIndex !== undefined && validIndexes.has(trackIndex);
    }).length,
    staleEtfCodes: features
      .filter((feature) => !feature.dataQuality.sampleValid)
      .map((feature) => feature.code)
      .sort(),
    valuationUnsupportedIndexes: unsupportedIndexes,
  });

  return { valuation, samples };
}

interface SelectedValuation {
  trackIndex: string;
  item: ValuationFeature;
}

function selectByIndex(
  indexes: readonly string[],
  linkedFeatures: ReadonlyMap<string, readonly EtfFeatureFile[]>,
  key: ValuationKey,
): SelectedValuation[] {
  const selected: SelectedValuation[] = [];
  for (const trackIndex of indexes) {
    const candidates = (linkedFeatures.get(trackIndex) ?? [])
      .map((feature) => feature.features.valuation[key])
      .filter((item): item is ValuationFeature => item !== null)
      .sort((left, right) => left.lagDays - right.lagDays || left.date.localeCompare(right.date));
    const item = candidates[0];
    if (item !== undefined) {
      selected.push({ trackIndex, item });
    }
  }
  return selected;
}

function calculateTypeStats(
  selected: readonly SelectedValuation[],
  features: readonly EtfFeatureFile[],
  trackIndexByCode: ReadonlyMap<string, string>,
  uniqueIndexes: readonly string[],
  config: CalculationConfig,
): ValuationTypeStats {
  const valid = selected.filter(
    (entry) =>
      entry.item.lagDays <= config.valuationFreshness.maxUsableDays &&
      entry.item.historicalPercentile !== null,
  );
  const validIndexes = new Set(valid.map((entry) => entry.trackIndex));
  const percentiles = valid.map((entry) => roundTo(entry.item.historicalPercentile ?? 0));
  const coverageRatio = ratio(valid.length, uniqueIndexes.length);
  const validEtfCount = features.filter((feature) => {
    const trackIndex = trackIndexByCode.get(feature.code);
    return trackIndex !== undefined && validIndexes.has(trackIndex);
  }).length;
  const insufficientSample = valid.length < 5 || (coverageRatio ?? 0) < 0.5;

  return {
    validCount: valid.length,
    validEtfCount,
    coverageRatio,
    etfCoverageRatio: ratio(validEtfCount, features.length),
    medianPercentile: insufficientSample ? null : rounded(median(percentiles)),
    lowCount: insufficientSample
      ? null
      : percentiles.filter((value) => value <= VALUATION_LOW_PERCENTILE).length,
    highCount: insufficientSample
      ? null
      : percentiles.filter((value) => value >= VALUATION_HIGH_PERCENTILE).length,
    staleCount: insufficientSample
      ? null
      : selected.filter((entry) => entry.item.freshness === "stale").length,
    tooStaleCount: insufficientSample
      ? null
      : selected.filter((entry) => entry.item.freshness === "too_stale").length,
    insufficientSample,
    distribution: insufficientSample ? [] : distribution(percentiles, VALUATION_PERCENTILE_BINS),
  };
}
