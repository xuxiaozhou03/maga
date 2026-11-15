import type { CalculationConfig } from "../config/schemas.js";
import type { TrendFeatures } from "../domain/features.js";
import type { Kline } from "../sources/types.js";
import { mean, roundTo, standardDeviation } from "./math.js";

export function calculateTrend(rows: readonly Kline[], config: CalculationConfig): TrendFeatures {
  const closes = rows.map((row) => row.close);
  const latest = closes.at(-1);
  const configuredPeriods = new Set(config.movingAveragePeriods);
  const ma5 = movingAverage(closes, 5, configuredPeriods);
  const ma10 = movingAverage(closes, 10, configuredPeriods);
  const ma20 = movingAverage(closes, 20, configuredPeriods);
  const ma60 = movingAverage(closes, 60, configuredPeriods);
  const ma120 = movingAverage(closes, 120, configuredPeriods);

  const alignment = calculateAlignment(latest, { ma5, ma10, ma20, ma60 }, config);
  const boll20 = calculateBollinger(closes, config);

  return {
    close: rounded(latest ?? null),
    ma5: rounded(ma5),
    ma10: rounded(ma10),
    ma20: rounded(ma20),
    ma60: rounded(ma60),
    ma120: rounded(ma120),
    ma20Deviation: deviation(latest, ma20),
    ma60Deviation: deviation(latest, ma60),
    aboveMa20: above(latest, ma20),
    aboveMa60: above(latest, ma60),
    aboveMa120: above(latest, ma120),
    maAlignment: alignment.alignment,
    maAlignmentScore: alignment.score,
    boll20,
  };
}

function movingAverage(
  closes: readonly number[],
  periods: number,
  configuredPeriods: ReadonlySet<number>,
): number | null {
  if (!configuredPeriods.has(periods) || closes.length < periods) {
    return null;
  }
  return mean(closes.slice(-periods));
}

function calculateAlignment(
  close: number | undefined,
  averages: {
    ma5: number | null;
    ma10: number | null;
    ma20: number | null;
    ma60: number | null;
  },
  config: CalculationConfig,
): { alignment: TrendFeatures["maAlignment"]; score: number | null } {
  const { ma5, ma10, ma20, ma60 } = averages;
  if (close === undefined || [ma5, ma10, ma20, ma60].some((value) => value === null)) {
    return { alignment: null, score: null };
  }

  const values = { close, ma5, ma10, ma20, ma60 } as {
    close: number;
    ma5: number;
    ma10: number;
    ma20: number;
    ma60: number;
  };
  const bullish =
    (!config.trendAlignment.requireCloseAboveShortest || values.close > values.ma5) &&
    values.ma5 > values.ma10 &&
    values.ma10 > values.ma20 &&
    values.ma20 > values.ma60;
  const bearish =
    (!config.trendAlignment.requireCloseAboveShortest || values.close < values.ma5) &&
    values.ma5 < values.ma10 &&
    values.ma10 < values.ma20 &&
    values.ma20 < values.ma60;
  const alignment = bullish ? "bullish" : bearish ? "bearish" : "neutral";
  const score = [
    values.close > values.ma5,
    values.ma5 > values.ma10,
    values.ma10 > values.ma20,
    values.ma20 > values.ma60,
    values.close > values.ma20,
    values.close > values.ma60,
  ].filter(Boolean).length;

  return { alignment, score };
}

function calculateBollinger(
  closes: readonly number[],
  config: CalculationConfig,
): TrendFeatures["boll20"] {
  const period = config.bollinger.period;
  if (closes.length < period) {
    return { middle: null, upper: null, lower: null, percentB: null, bandwidth: null };
  }

  const window = closes.slice(-period);
  const middle = mean(window);
  const deviation = standardDeviation(window, 0);
  const latest = closes.at(-1);
  if (middle === null || deviation === null || latest === undefined) {
    return { middle: null, upper: null, lower: null, percentB: null, bandwidth: null };
  }

  const upper = middle + config.bollinger.standardDeviation * deviation;
  const lower = middle - config.bollinger.standardDeviation * deviation;
  const percentB = upper > lower ? (latest - lower) / (upper - lower) : null;
  const bandwidth = middle > 0 ? (upper - lower) / middle : null;

  return {
    middle: roundTo(middle),
    upper: roundTo(upper),
    lower: roundTo(lower),
    percentB: rounded(percentB),
    bandwidth: rounded(bandwidth),
  };
}

function deviation(close: number | undefined, average: number | null): number | null {
  if (close === undefined || average === null || average === 0) {
    return null;
  }
  return roundTo(close / average - 1);
}

function above(close: number | undefined, average: number | null): boolean | null {
  return close === undefined || average === null ? null : close > average;
}

function rounded(value: number | null): number | null {
  return value === null ? null : roundTo(value);
}
