import type { CalculationConfig } from "../config/schemas.js";
import type { ActivityFeatures } from "../domain/features.js";
import type { Kline } from "../sources/types.js";
import { roundTo, validAmountAverage } from "./math.js";

export function calculateActivity(
  rows: readonly Kline[],
  config: CalculationConfig,
): ActivityFeatures {
  const average5 = averageAmount(rows, 5, config);
  const average20 = averageAmount(rows, 20, config);
  const average60 = averageAmount(rows, 60, config);
  const amount = rows.at(-1)?.amount ?? null;

  return {
    amount: rounded(amount),
    averageAmount5d: rounded(average5.average),
    averageAmount20d: rounded(average20.average),
    averageAmount60d: rounded(average60.average),
    amountRatio20d: amountRatio(amount, average20.average),
    amountRatio60d: amountRatio(amount, average60.average),
    amountSampleCount20d: average20.sampleCount,
  };
}

export function countAmountSamples20d(rows: readonly Kline[]): number {
  return rows.slice(-20).filter((row) => row.amount !== null).length;
}

function averageAmount(
  rows: readonly Kline[],
  periods: number,
  config: CalculationConfig,
): { average: number | null; sampleCount: number } {
  const amounts = rows.slice(-periods).map((row) => row.amount);
  return validAmountAverage(amounts, periods, config.activity.minAmountSampleRatio);
}

function amountRatio(amount: number | null, average: number | null): number | null {
  if (amount === null || average === null || average === 0) {
    return null;
  }
  return roundTo(amount / average - 1);
}

function rounded(value: number | null): number | null {
  return value === null ? null : roundTo(value);
}
