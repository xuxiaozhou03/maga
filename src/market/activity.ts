import type { EtfFeatureFile } from "../domain/features.js";
import { marketActivitySchema, type ActivityStats, type MarketActivity } from "../domain/market.js";
import { mean, median, roundTo } from "../calculations/math.js";
import { distribution, ratio, rounded } from "./statistics.js";

export const AMOUNT_EXPANSION_THRESHOLD = 0.5;
export const AMOUNT_DISTRIBUTION_BINS = [
  0, 10_000_000, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000, 10_000_000_000,
  1_000_000_000_000,
] as const;

export function calculateMarketActivity(
  features: readonly EtfFeatureFile[],
  analysisDate: string,
): MarketActivity {
  const amounts = numericValues(features.map((feature) => feature.features.activity.amount));
  const ratios = numericValues(features.map((feature) => feature.features.activity.amountRatio20d));
  const expandedCount = ratios.filter((value) => value >= AMOUNT_EXPANSION_THRESHOLD).length;

  const activity: ActivityStats = {
    amountValidCount: amounts.length,
    totalAmount:
      amounts.length === 0 ? null : roundTo(amounts.reduce((sum, value) => sum + value, 0)),
    meanAmount: rounded(mean(amounts)),
    medianAmount: rounded(median(amounts)),
    ratioValidCount: ratios.length,
    meanAmountRatio20d: rounded(mean(ratios)),
    expandedCount,
    expandedRatio: ratio(expandedCount, ratios.length),
    amountDistribution: distribution(amounts, AMOUNT_DISTRIBUTION_BINS),
  };

  return marketActivitySchema.parse({ schemaVersion: 1, analysisDate, activity });
}

function numericValues(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null).map((value) => roundTo(value));
}
