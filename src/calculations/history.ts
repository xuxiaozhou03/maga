import type { CalculationConfig } from "../config/schemas.js";
import type { HistoryFeatures, HistoryStats } from "../domain/features.js";
import type { Kline } from "../sources/types.js";
import {
  calculateDrawdown,
  countNewHighs,
  dailyReturns,
  maximumNegativeStreak,
  maximumPositiveStreak,
  mean,
  median,
  roundTo,
  standardDeviation,
  validAmountAverage,
} from "./math.js";

export function calculateHistoryFeatures(
  rows: readonly Kline[],
  analysisDate: string,
  config: CalculationConfig,
): HistoryFeatures {
  return {
    "1m": fixedWindow(rows, config.historyPeriods["1m"], config),
    "3m": fixedWindow(rows, config.historyPeriods["3m"], config),
    "6m": fixedWindow(rows, config.historyPeriods["6m"], config),
    ytd: ytdWindow(rows, analysisDate, config),
    "1y": fixedWindow(rows, config.historyPeriods["1y"], config),
    "2y": fixedWindow(rows, config.historyPeriods["2y"], config),
  };
}

function fixedWindow(
  rows: readonly Kline[],
  periods: number,
  config: CalculationConfig,
): HistoryStats | null {
  if (rows.length < periods + 1) {
    return null;
  }
  return calculateHistoryWindow(rows.slice(-(periods + 1)), config);
}

function ytdWindow(
  rows: readonly Kline[],
  analysisDate: string,
  config: CalculationConfig,
): HistoryStats | null {
  const yearStart = `${analysisDate.slice(0, 4)}-01-01`;
  let previousYearLastIndex = -1;
  for (const [index, row] of rows.entries()) {
    if (row.date < yearStart) {
      previousYearLastIndex = index;
    } else {
      break;
    }
  }
  if (previousYearLastIndex < 0) {
    return null;
  }

  const window = rows.slice(previousYearLastIndex);
  return window.length < 2 ? null : calculateHistoryWindow(window, config);
}

function calculateHistoryWindow(rows: readonly Kline[], config: CalculationConfig): HistoryStats {
  const closes = rows.map((row) => row.close);
  const returns = dailyReturns(closes);
  const periods = returns.length;
  const first = closes[0];
  const latest = closes.at(-1);
  if (first === undefined || latest === undefined || periods === 0) {
    throw new Error("History window requires at least two rows");
  }

  const totalReturn = latest / first - 1;
  const meanReturn = mean(returns);
  const medianReturn = median(returns);
  if (meanReturn === null || medianReturn === null) {
    throw new Error("History window produced no return statistics");
  }

  const returnStd = standardDeviation(returns, 0);
  const annualizedReturn =
    periods < 20 || 1 + totalReturn <= 0
      ? null
      : Math.pow(1 + totalReturn, config.annualizationDays / periods) - 1;
  const annualizedVolatility =
    returnStd === null ? null : returnStd * Math.sqrt(config.annualizationDays);
  const maxDrawdown = calculateDrawdown(
    rows.map((row) => ({ date: row.date, close: row.close })),
  ).maxDrawdown;
  const riskFreeDaily = Math.pow(1 + config.riskFreeRateAnnual, 1 / config.annualizationDays) - 1;
  const excessMean = meanReturn - riskFreeDaily;
  const sharpe =
    returnStd === null || returnStd === 0
      ? null
      : (excessMean / returnStd) * Math.sqrt(config.annualizationDays);
  const downside = Math.sqrt(
    mean(returns.map((value) => Math.min(0, value - riskFreeDaily) ** 2)) ?? 0,
  );
  const sortino =
    downside === 0 ? null : (excessMean / downside) * Math.sqrt(config.annualizationDays);
  const calmar =
    annualizedReturn === null || maxDrawdown === 0
      ? null
      : annualizedReturn / Math.abs(maxDrawdown);
  const amounts = validAmountAverage(
    rows.map((row) => row.amount),
    rows.length,
    config.activity.minAmountSampleRatio,
  );

  return {
    tradingDays: periods,
    totalReturn: roundTo(totalReturn),
    annualizedReturn: rounded(annualizedReturn),
    meanDailyReturn: roundTo(meanReturn),
    medianDailyReturn: roundTo(medianReturn),
    dailyReturnStd: rounded(returnStd),
    annualizedVolatility: rounded(annualizedVolatility),
    maxDrawdown: roundTo(maxDrawdown),
    sharpe: rounded(sharpe),
    sortino: rounded(sortino),
    calmar: rounded(calmar),
    maxUpStreak: maximumPositiveStreak(returns),
    maxDownStreak: maximumNegativeStreak(returns),
    newHighCount: countNewHighs(closes),
    averageAmount: rounded(amounts.average),
    amountSampleCount: amounts.sampleCount,
  };
}

function rounded(value: number | null): number | null {
  return value === null ? null : roundTo(value);
}
