import type { CalculationConfig } from "../config/schemas.js";
import type { ValuationFeature, ValuationFeatures } from "../domain/features.js";
import type { IndexValuationItem, ValuationType } from "../domain/valuation.js";
import { calculateValuationLag } from "../processing/valuation-lag.js";
import { roundTo } from "./math.js";

export function calculateValuationFeatures(
  valuations: readonly IndexValuationItem[],
  analysisDate: string,
  config: CalculationConfig,
): ValuationFeatures {
  const latest = latestValuations(valuations, analysisDate);
  return {
    pe: toFeature(latest.PE, analysisDate, config),
    pb: toFeature(latest.PB, analysisDate, config),
    ps: toFeature(latest.PS, analysisDate, config),
  };
}

function latestValuations(
  valuations: readonly IndexValuationItem[],
  analysisDate: string,
): Partial<Record<ValuationType, IndexValuationItem>> {
  const latest: Partial<Record<ValuationType, IndexValuationItem>> = {};
  for (const item of valuations) {
    if (item.date > analysisDate) {
      continue;
    }
    const current = latest[item.type];
    if (!current || item.date >= current.date) {
      latest[item.type] = item;
    }
  }
  return latest;
}

function toFeature(
  item: IndexValuationItem | undefined,
  analysisDate: string,
  config: CalculationConfig,
): ValuationFeature | null {
  if (!item) {
    return null;
  }
  const lag = calculateValuationLag(item.date, analysisDate, config.valuationFreshness);
  const peg = item.type === "PE" ? item.peg : null;

  return {
    value: roundTo(item.value),
    historicalPercentile:
      item.historicalPercentile === null ? null : roundTo(item.historicalPercentile),
    date: item.date,
    lagDays: lag.lagDays,
    lagTradingDays: lag.lagTradingDays,
    peg: peg === null ? null : roundTo(peg),
    pegUsable: item.type === "PE" && item.pegUsable,
    source: item.source,
    freshness: lag.freshness,
  };
}
