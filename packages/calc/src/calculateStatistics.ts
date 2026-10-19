/* ============================================================
 * 四、历史统计（单只 ETF）
 * ============================================================ */

import { Kline } from "@maga/db";
import { StatisticPeriod, EtfStatistic } from "./types";
import {
  sortKlines,
  isFiniteNumber,
  pctChange,
  TRADING_DAYS_PER_YEAR,
  mean,
  std,
  maxDrawdown,
  median,
  quantile,
} from "./utils";

interface PeriodSlice {
  period: StatisticPeriod;
  klines: Kline[];
}

function sliceByNaturalPeriod(
  klines: Kline[],
  period: StatisticPeriod,
): Kline[] {
  if (klines.length === 0) return [];
  const lastDate = klines[klines.length - 1].date;
  const last = new Date(lastDate);
  if (Number.isNaN(last.getTime())) return klines;

  let start: Date | null = null;
  switch (period) {
    case "1M":
      start = new Date(last);
      start.setMonth(start.getMonth() - 1);
      break;
    case "3M":
      start = new Date(last);
      start.setMonth(start.getMonth() - 3);
      break;
    case "6M":
      start = new Date(last);
      start.setMonth(start.getMonth() - 6);
      break;
    case "1Y":
      start = new Date(last);
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "2Y":
      start = new Date(last);
      start.setFullYear(start.getFullYear() - 2);
      break;
    case "YTD":
      start = new Date(last.getFullYear(), 0, 1);
      break;
    default:
      return klines;
  }
  return klines.filter((k) => k.date >= start!.getTime());
}

function sliceByTradingDays(klines: Kline[], days: number): Kline[] {
  if (klines.length <= days) return klines;
  return klines.slice(klines.length - days);
}

function getPeriodSlices(klines: Kline[]): PeriodSlice[] {
  return [
    { period: "ALL", klines },
    { period: "1M", klines: sliceByNaturalPeriod(klines, "1M") },
    { period: "3M", klines: sliceByNaturalPeriod(klines, "3M") },
    { period: "6M", klines: sliceByNaturalPeriod(klines, "6M") },
    { period: "YTD", klines: sliceByNaturalPeriod(klines, "YTD") },
    { period: "1Y", klines: sliceByNaturalPeriod(klines, "1Y") },
    { period: "2Y", klines: sliceByNaturalPeriod(klines, "2Y") },
    { period: "5D", klines: sliceByTradingDays(klines, 5) },
    { period: "20D", klines: sliceByTradingDays(klines, 20) },
    { period: "60D", klines: sliceByTradingDays(klines, 60) },
    { period: "120D", klines: sliceByTradingDays(klines, 120) },
    { period: "250D", klines: sliceByTradingDays(klines, 250) },
  ];
}

function countConsecutive(
  dailyReturns: number[],
  direction: "up" | "down",
): number {
  let maxCount = 0;
  let current = 0;
  for (const r of dailyReturns) {
    const hit = direction === "up" ? r > 0 : r < 0;
    if (hit) {
      current++;
      maxCount = Math.max(maxCount, current);
    } else {
      current = 0;
    }
  }
  return maxCount;
}

function countNewHighs(klines: Kline[]): number {
  let count = 0;
  let runningMax = -Infinity;
  for (const k of klines) {
    if (k.close > runningMax) {
      count++;
      runningMax = k.close;
    }
  }
  return count;
}

function pricePosition(klines: Kline[], window: number): number | null {
  if (klines.length < window) return null;
  const slice = klines.slice(klines.length - window);
  const high = Math.max(...slice.map((k) => k.high));
  const low = Math.min(...slice.map((k) => k.low));
  const close = slice[slice.length - 1].close;
  if (high === low) return null;
  return (close - low) / (high - low);
}

function calcStatisticForSlice(
  code: string,
  slice: Kline[],
  period: StatisticPeriod,
): EtfStatistic {
  const klines = sortKlines(slice);
  const closes = klines.map((k) => k.close);
  const amounts = klines.map((k) => k.amount).filter(isFiniteNumber);

  const dailyReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const r = pctChange(closes[i], closes[i - 1]);
    if (r !== null) dailyReturns.push(r);
  }

  const totalReturn =
    closes.length >= 2 ? pctChange(closes[closes.length - 1], closes[0]) : null;
  const days = Math.max(klines.length - 1, 1);
  const annualizedReturn =
    totalReturn !== null
      ? Math.pow(1 + totalReturn, TRADING_DAYS_PER_YEAR / days) - 1
      : null;

  const meanRet = mean(dailyReturns);
  const stdRet = std(dailyReturns);
  const annualizedVolatility =
    stdRet !== null ? stdRet * Math.sqrt(TRADING_DAYS_PER_YEAR) : null;

  const downsideReturns = dailyReturns.filter((r) => r < 0);
  const downsideStd = std(downsideReturns);
  const downsideVolatility =
    downsideStd !== null
      ? downsideStd * Math.sqrt(TRADING_DAYS_PER_YEAR)
      : null;

  const mdd = maxDrawdown(closes);
  const sharpe =
    meanRet !== null && stdRet && stdRet > 0
      ? (meanRet * TRADING_DAYS_PER_YEAR) /
        (stdRet * Math.sqrt(TRADING_DAYS_PER_YEAR))
      : null;
  const sortino =
    meanRet !== null && downsideVolatility && downsideVolatility > 0
      ? (meanRet * TRADING_DAYS_PER_YEAR) / downsideVolatility
      : null;
  const calmar =
    annualizedReturn !== null && mdd !== null && mdd < 0
      ? annualizedReturn / Math.abs(mdd)
      : null;

  const upDays = dailyReturns.filter((r) => r > 0).length;
  const downDays = dailyReturns.filter((r) => r < 0).length;
  const flatDays = dailyReturns.filter((r) => r === 0).length;

  const maxGain = dailyReturns.length ? Math.max(...dailyReturns) : null;
  const maxLoss = dailyReturns.length ? Math.min(...dailyReturns) : null;

  return {
    code,
    period,
    startDate: klines.length ? klines[0].date : 0,
    endDate: klines.length ? klines[klines.length - 1].date : 0,
    validDays: klines.length,
    cumulativeReturn: totalReturn,
    annualizedReturn,
    return5:
      closes.length > 5
        ? pctChange(closes[closes.length - 1], closes[closes.length - 6])
        : null,
    return20:
      closes.length > 20
        ? pctChange(closes[closes.length - 1], closes[closes.length - 21])
        : null,
    return60:
      closes.length > 60
        ? pctChange(closes[closes.length - 1], closes[closes.length - 61])
        : null,
    return120:
      closes.length > 120
        ? pctChange(closes[closes.length - 1], closes[closes.length - 121])
        : null,
    return250:
      closes.length > 250
        ? pctChange(closes[closes.length - 1], closes[closes.length - 251])
        : null,
    dailyReturnMean: meanRet,
    dailyReturnMedian: median(dailyReturns),
    dailyReturnStd: stdRet,
    dailyReturnP10: quantile(dailyReturns, 0.1),
    dailyReturnP90: quantile(dailyReturns, 0.9),
    upDays,
    downDays,
    flatDays,
    upProbability: dailyReturns.length ? upDays / dailyReturns.length : null,
    annualizedVolatility,
    downsideVolatility,
    maxDrawdown: mdd,
    sharpe,
    sortino,
    calmar,
    maxSingleDayGain: maxGain,
    maxSingleDayLoss: maxLoss,
    maxConsecutiveUpDays: countConsecutive(dailyReturns, "up"),
    maxConsecutiveDownDays: countConsecutive(dailyReturns, "down"),
    newHighCount: countNewHighs(klines),
    avgAmount: mean(amounts),
    medianAmount: median(amounts),
    amountP10: quantile(amounts, 0.1),
    amountP90: quantile(amounts, 0.9),
    pricePosition20: pricePosition(klines, 20),
    pricePosition60: pricePosition(klines, 60),
    pricePosition120: pricePosition(klines, 120),
    pricePosition250: pricePosition(klines, 250),
  };
}

export function calculateStatistics(
  code: string,
  rawKlines: Kline[],
): EtfStatistic[] {
  const klines = sortKlines(rawKlines).filter(
    (k) => isFiniteNumber(k.close) && k.close > 0 && isFiniteNumber(k.date),
  );
  if (klines.length === 0) return [];

  return getPeriodSlices(klines).map(({ period, klines: slice }) =>
    calcStatisticForSlice(code, slice, period),
  );
}
