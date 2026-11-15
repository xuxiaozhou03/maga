import type { CalculationConfig } from "../config/schemas.js";
import type { EtfFeatureFile } from "../domain/features.js";
import {
  MARKET_RETURN_PERIODS,
  marketReturnsSchema,
  type MarketReturnPeriod,
  type MarketReturns,
  type ReturnStats,
} from "../domain/market.js";
import { mean, median, roundTo } from "../calculations/math.js";
import { distribution, quantileLinear, ratio } from "./statistics.js";

const FLAT_EPSILON = 1e-9;

export function calculateMarketReturns(
  features: readonly EtfFeatureFile[],
  analysisDate: string,
  config: CalculationConfig,
): MarketReturns {
  const returns = Object.fromEntries(
    MARKET_RETURN_PERIODS.map((period) => [
      period,
      calculateReturnStats(
        features.map((feature) => feature.features.returns[period]),
        period,
        config,
      ),
    ]),
  ) as Record<MarketReturnPeriod, ReturnStats>;

  return marketReturnsSchema.parse({
    schemaVersion: 1,
    analysisDate,
    returns,
  });
}

function calculateReturnStats(
  rawValues: readonly (number | null)[],
  period: MarketReturnPeriod,
  config: CalculationConfig,
): ReturnStats {
  const values = rawValues.filter((value): value is number => value !== null);
  const validCount = values.length;
  const upCount = values.filter((value) => value > FLAT_EPSILON).length;
  const downCount = values.filter((value) => value < -FLAT_EPSILON).length;
  const flatCount = validCount - upCount - downCount;
  const enoughForQuantiles = validCount >= 5;
  const bins =
    period === "1d"
      ? config.distributionBins.return1d
      : period === "20d"
        ? config.distributionBins.return20d
        : null;

  return {
    validCount,
    mean: rounded(mean(values)),
    median: rounded(median(values)),
    upCount,
    downCount,
    flatCount,
    positiveRatio: ratio(upCount, validCount),
    negativeRatio: ratio(downCount, validCount),
    p10: enoughForQuantiles ? quantileLinear(values, 0.1) : null,
    p25: enoughForQuantiles ? quantileLinear(values, 0.25) : null,
    p75: enoughForQuantiles ? quantileLinear(values, 0.75) : null,
    p90: enoughForQuantiles ? quantileLinear(values, 0.9) : null,
    distribution: bins === null ? [] : distribution(values, bins),
  };
}

function rounded(value: number | null): number | null {
  return value === null ? null : roundTo(value);
}
