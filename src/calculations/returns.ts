import type { CalculationConfig } from "../config/schemas.js";
import type { ReturnsFeatures } from "../domain/features.js";
import type { Kline } from "../sources/types.js";
import { roundTo } from "./math.js";

export function calculateReturns(
  rows: readonly Kline[],
  analysisDate: string,
  config: CalculationConfig,
): ReturnsFeatures {
  const closes = rows.map((row) => row.close);
  const configuredPeriods = new Set(config.returnPeriods);

  return {
    "1d": periodReturn(closes, 1, configuredPeriods),
    "5d": periodReturn(closes, 5, configuredPeriods),
    "20d": periodReturn(closes, 20, configuredPeriods),
    "60d": periodReturn(closes, 60, configuredPeriods),
    "120d": periodReturn(closes, 120, configuredPeriods),
    "250d": periodReturn(closes, 250, configuredPeriods),
    ytd: ytdReturn(rows, analysisDate),
  };
}

function periodReturn(
  closes: readonly number[],
  periods: number,
  configuredPeriods: ReadonlySet<number>,
): number | null {
  if (!configuredPeriods.has(periods) || closes.length < periods + 1) {
    return null;
  }
  const latest = closes.at(-1);
  const base = closes.at(-(periods + 1));
  if (latest === undefined || base === undefined) {
    return null;
  }
  return roundTo(latest / base - 1);
}

function ytdReturn(rows: readonly Kline[], analysisDate: string): number | null {
  const yearStart = `${analysisDate.slice(0, 4)}-01-01`;
  let previousYearLastIndex = -1;
  for (const [index, row] of rows.entries()) {
    if (row.date < yearStart) {
      previousYearLastIndex = index;
    } else {
      break;
    }
  }

  if (previousYearLastIndex < 0 || previousYearLastIndex >= rows.length - 1) {
    return null;
  }
  const base = rows[previousYearLastIndex]?.close;
  const latest = rows.at(-1)?.close;
  if (base === undefined || latest === undefined) {
    return null;
  }
  return roundTo(latest / base - 1);
}
