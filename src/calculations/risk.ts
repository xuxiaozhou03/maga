import type { CalculationConfig } from "../config/schemas.js";
import type { RiskFeatures } from "../domain/features.js";
import type { Kline } from "../sources/types.js";
import { calculateDrawdown, dailyReturns, roundTo, standardDeviation } from "./math.js";

export function calculateRisk(rows: readonly Kline[], config: CalculationConfig): RiskFeatures {
  const closes = rows.map((row) => row.close);
  const drawdown60 = maxDrawdown(rows, 60, config);
  const current = currentDrawdown(closes);

  return {
    volatility20d: volatility(closes, 20, config),
    volatility60d: volatility(closes, 60, config),
    volatility120d: volatility(closes, 120, config),
    maxDrawdown20d: maxDrawdownValue(rows, 20, config),
    maxDrawdown60d: rounded(drawdown60?.maxDrawdown ?? null),
    maxDrawdown120d: maxDrawdownValue(rows, 120, config),
    maxDrawdown250d: maxDrawdownValue(rows, 250, config),
    currentDrawdown: rounded(current?.drawdown ?? null),
    sampleHigh: rounded(current?.sampleHigh ?? null),
    distanceFromSampleHigh: rounded(current?.drawdown ?? null),
    maxDrawdown60dPeakDate: drawdown60?.peakDate ?? null,
    maxDrawdown60dTroughDate: drawdown60?.troughDate ?? null,
  };
}

function volatility(
  closes: readonly number[],
  periods: number,
  config: CalculationConfig,
): number | null {
  if (!config.volatilityPeriods.includes(periods) || closes.length < periods + 1) {
    return null;
  }
  const returns = dailyReturns(closes.slice(-(periods + 1)));
  const deviation = standardDeviation(returns, config.volatilityDdof);
  return deviation === null ? null : roundTo(deviation * Math.sqrt(config.annualizationDays));
}

function maxDrawdown(
  rows: readonly Kline[],
  periods: number,
  config: CalculationConfig,
): { maxDrawdown: number; peakDate: string | null; troughDate: string | null } | null {
  if (!config.drawdownPeriods.includes(periods) || rows.length < periods + 1) {
    return null;
  }
  return calculateDrawdown(
    rows.slice(-(periods + 1)).map((row) => ({ date: row.date, close: row.close })),
  );
}

function maxDrawdownValue(
  rows: readonly Kline[],
  periods: number,
  config: CalculationConfig,
): number | null {
  const result = maxDrawdown(rows, periods, config);
  return result === null ? null : roundTo(result.maxDrawdown);
}

function currentDrawdown(
  closes: readonly number[],
): { sampleHigh: number; drawdown: number } | null {
  if (closes.length === 0) {
    return null;
  }
  const sampleHigh = Math.max(...closes);
  const latest = closes.at(-1);
  if (latest === undefined || sampleHigh <= 0) {
    return null;
  }
  return {
    sampleHigh,
    drawdown: latest / sampleHigh - 1,
  };
}

function rounded(value: number | null): number | null {
  return value === null ? null : roundTo(value);
}
