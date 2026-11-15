import { addUtcDays, isRealDate, naturalDayDifference } from "../domain/date.js";
import { listTradingDays } from "../domain/trading-calendar.js";

export interface ValuationFreshnessConfig {
  freshDays: number;
  maxUsableDays: number;
}

export interface ValuationLag {
  lagDays: number;
  lagTradingDays: number;
  freshness: "fresh" | "stale" | "too_stale";
}

export function calculateValuationLag(
  valuationDate: string,
  analysisDate: string,
  config: ValuationFreshnessConfig,
): ValuationLag {
  if (!isRealDate(valuationDate) || !isRealDate(analysisDate)) {
    throw new RangeError(`Invalid valuation or analysis date: ${valuationDate}, ${analysisDate}`);
  }

  const lagDays = naturalDayDifference(analysisDate, valuationDate);
  if (lagDays < 0) {
    throw new RangeError(`Valuation date is later than analysis date: ${valuationDate}`);
  }

  const lagTradingDays =
    lagDays === 0 ? 0 : listTradingDays(addUtcDays(valuationDate, 1), analysisDate).length;

  return {
    lagDays,
    lagTradingDays,
    freshness:
      lagDays <= config.freshDays
        ? "fresh"
        : lagDays <= config.maxUsableDays
          ? "stale"
          : "too_stale",
  };
}
