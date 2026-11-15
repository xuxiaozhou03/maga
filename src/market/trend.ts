import type { EtfFeatureFile } from "../domain/features.js";
import { marketTrendSchema, type MarketTrend, type TrendStats } from "../domain/market.js";
import { ratio } from "./statistics.js";

export function calculateMarketTrend(
  features: readonly EtfFeatureFile[],
  analysisDate: string,
): MarketTrend {
  const alignments = features
    .map((feature) => feature.features.trend.maAlignment)
    .filter((value): value is "bullish" | "bearish" | "neutral" => value !== null);
  const bullishCount = alignments.filter((value) => value === "bullish").length;
  const bearishCount = alignments.filter((value) => value === "bearish").length;
  const neutralCount = alignments.length - bullishCount - bearishCount;
  const aboveMa20 = aboveMovingAverage(features, "aboveMa20");
  const aboveMa60 = aboveMovingAverage(features, "aboveMa60");
  const aboveMa120 = aboveMovingAverage(features, "aboveMa120");

  const trend: TrendStats = {
    validCount: alignments.length,
    bullishCount,
    bearishCount,
    neutralCount,
    bullishRatio: ratio(bullishCount, alignments.length),
    bearishRatio: ratio(bearishCount, alignments.length),
    neutralRatio: ratio(neutralCount, alignments.length),
    aboveMa20ValidCount: aboveMa20.validCount,
    aboveMa20Count: aboveMa20.count,
    aboveMa20Ratio: ratio(aboveMa20.count, aboveMa20.validCount),
    aboveMa60ValidCount: aboveMa60.validCount,
    aboveMa60Count: aboveMa60.count,
    aboveMa60Ratio: ratio(aboveMa60.count, aboveMa60.validCount),
    aboveMa120ValidCount: aboveMa120.validCount,
    aboveMa120Count: aboveMa120.count,
    aboveMa120Ratio: ratio(aboveMa120.count, aboveMa120.validCount),
  };

  return marketTrendSchema.parse({ schemaVersion: 1, analysisDate, trend });
}

function aboveMovingAverage(
  features: readonly EtfFeatureFile[],
  key: "aboveMa20" | "aboveMa60" | "aboveMa120",
): { validCount: number; count: number } {
  const values = features
    .map((feature) => feature.features.trend[key])
    .filter((value): value is boolean => value !== null);
  return { validCount: values.length, count: values.filter(Boolean).length };
}
