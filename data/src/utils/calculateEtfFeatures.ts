/**
 * etfFeatures.ts
 *
 * ETF 日度特征计算
 *
 * 输入：
 *   etf: Etf
 *   klines: Kline[]
 *   valuations: Valuation[]
 *
 * 输出：
 *   EtfFeatures
 */

import { Kline } from "../fetch/klines";
import { Valuation } from "../fetch/valuation";
import { Etf } from "../type";

// ============================================================
// 1. 基础类型
// ============================================================

export type Nullable<T> = T | null;

export type Trend = "rising" | "falling" | "flat" | "unknown";

export type AnalysisStatus =
  | "very_low"
  | "low"
  | "neutral"
  | "high"
  | "very_high"
  | "unknown";

export interface Metric<T, A = null> {
  value: T;
  analysis: A;
}

// ============================================================
// 2. 数据与行情
// ============================================================

export interface DataFeatures {
  latestDate: number;
  earliestDate: number;
  totalTradingDays: number;
}

export interface MarketFeatures {
  close: number;
  change: number;
  changePercent: number;

  high: number;
  low: number;

  volume: number;
  amount: number;
}

// ============================================================
// 3. 多周期表现
// ============================================================

export type PerformancePeriod =
  | "1w"
  | "1m"
  | "3m"
  | "6m"
  | "ytd"
  | "1y"
  | "3y"
  | "5y";

export interface PeriodPerformance {
  startDate: number | null;
  endDate: number | null;
  tradingDays: number;

  // 收益
  totalReturn: Metric<Nullable<number>, string>;
  annualizedReturn: Metric<Nullable<number>, string>;
  dailyReturnMean: Metric<Nullable<number>, string>;
  dailyReturnMedian: Metric<Nullable<number>, string>;

  // 风险
  volatility: Metric<Nullable<number>, string>;
  maxDrawdown: Metric<Nullable<number>, string>;

  // 涨跌统计
  upDays: number;
  downDays: number;
  flatDays: number;
  upDayRatio: number | null;
  downDayRatio: number | null;

  // 连续涨跌
  maxConsecutiveUpDays: number;
  maxConsecutiveDownDays: number;
  currentConsecutiveUpDays: number;
  currentConsecutiveDownDays: number;

  // 涨跌幅度
  averageUpReturn: number | null;
  averageDownReturn: number | null;
  largestDailyGain: number | null;
  largestDailyLoss: number | null;
  gainLossRatio: number | null;

  // 流动性
  averageAmount: number | null;
  medianAmount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  amountStdDev: number | null;
  amountChange: number | null;
  activeDays: number;
  activeDayRatio: number | null;
}

export type PerformanceFeatures = Record<PerformancePeriod, PeriodPerformance>;

// ============================================================
// 4. 均线
// ============================================================

export type MAAlignment = "bullish" | "bearish" | "mixed" | "unknown";

export type MACross = "golden" | "death" | "none" | "unknown";

export interface MAAnalysis {
  trend: Trend;
  pricePosition: "above" | "below" | "unknown";
}

export interface MovingAverages {
  ma5: Metric<Nullable<number>, MAAnalysis>;
  ma10: Metric<Nullable<number>, MAAnalysis>;
  ma20: Metric<Nullable<number>, MAAnalysis>;
  ma60: Metric<Nullable<number>, MAAnalysis>;
  ma120: Metric<Nullable<number>, MAAnalysis>;
  ma250: Metric<Nullable<number>, MAAnalysis>;

  analysis: {
    alignment: MAAlignment;
    cross: {
      ma5Ma20: MACross;
      ma10Ma60: MACross;
    };
    dispersion: number | null;
  };
}

// ============================================================
// 5. 均线偏离
// ============================================================

export type DeviationStatus =
  | "deeply_below"
  | "below"
  | "near"
  | "above"
  | "deeply_above"
  | "unknown";

export interface MADeviation {
  ma5: Metric<Nullable<number>, DeviationStatus>;
  ma10: Metric<Nullable<number>, DeviationStatus>;
  ma20: Metric<Nullable<number>, DeviationStatus>;
  ma60: Metric<Nullable<number>, DeviationStatus>;
  ma120: Metric<Nullable<number>, DeviationStatus>;
  ma250: Metric<Nullable<number>, DeviationStatus>;
}

// ============================================================
// 6. 布林带
// ============================================================

export interface BollingerBands {
  upper: Metric<Nullable<number>>;
  middle: Metric<Nullable<number>>;
  lower: Metric<Nullable<number>>;
  bandwidth: Metric<Nullable<number>>;
  percentB: Metric<Nullable<number>>;
}

export type BollingerPosition =
  | "above_upper"
  | "upper_half"
  | "lower_half"
  | "below_lower"
  | "unknown";

export type BandwidthTrend = "expanding" | "contracting" | "stable" | "unknown";

export type BollingerSignal =
  | "breakout_upper"
  | "breakout_lower"
  | "cross_above_middle"
  | "cross_below_middle"
  | "none"
  | "unknown";

export interface BollingerAnalysis {
  position: BollingerPosition;
  bandwidthTrend: BandwidthTrend;
  squeeze: boolean | null;
  priceSignal: BollingerSignal;
  middleTrend: Trend;
}

export interface BollingerPeriod {
  value: BollingerBands;
  analysis: BollingerAnalysis;
}

export interface BollingerFeatures {
  daily: BollingerPeriod;
  weekly: BollingerPeriod;
  monthly: BollingerPeriod;
}

// ============================================================
// 7. 估值
// ============================================================

export type ValuationPeriod = "1y" | "3y" | "5y" | "all";

export interface ValuationHistory {
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  stdDev: number | null;

  percentile: number | null;
  deviation: number | null;
  zScore: number | null;
}

export interface ValuationAnalysis {
  status: AnalysisStatus;
  history: Record<ValuationPeriod, ValuationHistory>;
}

export interface SingleValuationFeature {
  value: number | null;
  analysis: ValuationAnalysis;

  peg: number | null;
  date: number | null;
  delayDays: number | null;
}

export interface ValuationFeatures {
  PE: SingleValuationFeature;
  PB: SingleValuationFeature;
  PS: SingleValuationFeature;
}

// ============================================================
// 8. 最终结果
// ============================================================

type MixType = Etf & DataFeatures & MarketFeatures;

export interface EtfFeatures extends MixType {
  performance: PerformanceFeatures;

  movingAverages: MovingAverages;
  maDeviation: MADeviation;
  bollinger: BollingerFeatures;

  valuation: ValuationFeatures;
}

// ============================================================
// 9. 常量
// ============================================================

const TRADING_DAYS_PER_YEAR = 250;
const BOLLINGER_PERIOD = 20;
const BOLLINGER_MULTIPLIER = 2;

const MA_PERIODS = [5, 10, 20, 60, 120, 250] as const;

const PERFORMANCE_PERIODS: PerformancePeriod[] = [
  "1w",
  "1m",
  "3m",
  "6m",
  "ytd",
  "1y",
  "3y",
  "5y",
];

const VALUATION_PERIODS: ValuationPeriod[] = ["1y", "3y", "5y", "all"];

// ============================================================
// 10. 通用工具
// ============================================================

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function metric<T, A = null>(value: T, analysis: A = null as A): Metric<T, A> {
  return { value, analysis };
}

function mean(values: number[]): number | null {
  if (!values.length) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

/**
 * 样本标准差
 */
function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;

  const avg = mean(values)!;

  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}

function min(values: number[]): number | null {
  return values.length ? Math.min(...values) : null;
}

function max(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function toDate(date: number): Date {
  const year = Math.floor(date / 10000);
  const month = Math.floor((date % 10000) / 100);
  const day = date % 100;

  return new Date(Date.UTC(year, month - 1, day));
}

function toDateNumber(date: Date): number {
  return (
    date.getUTCFullYear() * 10000 +
    (date.getUTCMonth() + 1) * 100 +
    date.getUTCDate()
  );
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function subtractPeriod(date: Date, period: PerformancePeriod): Date {
  const result = new Date(date);

  switch (period) {
    case "1w":
      result.setUTCDate(result.getUTCDate() - 7);
      break;
    case "1m":
      result.setUTCMonth(result.getUTCMonth() - 1);
      break;
    case "3m":
      result.setUTCMonth(result.getUTCMonth() - 3);
      break;
    case "6m":
      result.setUTCMonth(result.getUTCMonth() - 6);
      break;
    case "1y":
      result.setUTCFullYear(result.getUTCFullYear() - 1);
      break;
    case "3y":
      result.setUTCFullYear(result.getUTCFullYear() - 3);
      break;
    case "5y":
      result.setUTCFullYear(result.getUTCFullYear() - 5);
      break;
    case "ytd":
      return new Date(Date.UTC(result.getUTCFullYear(), 0, 1));
  }

  return result;
}

function dateDiffDays(from: number, to: number): number {
  const diff = toDate(to).getTime() - toDate(from).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}
// ============================================================
// 12. 多周期表现计算
// ============================================================

function calculateConsecutiveDays(
  returns: number[],
  direction: "up" | "down",
): {
  max: number;
  current: number;
} {
  let maxCount = 0;
  let currentCount = 0;
  let count = 0;

  for (const value of returns) {
    const matched = direction === "up" ? value > 0 : value < 0;

    if (matched) {
      count++;
      maxCount = Math.max(maxCount, count);
    } else {
      count = 0;
    }
  }

  for (let i = returns.length - 1; i >= 0; i--) {
    const matched = direction === "up" ? returns[i] > 0 : returns[i] < 0;

    if (!matched) break;
    currentCount++;
  }

  return {
    max: maxCount,
    current: currentCount,
  };
}

function calculateMaxDrawdown(prices: number[]): number | null {
  if (prices.length < 2) return null;

  let peak = prices[0];
  let maxDrawdown = 0;

  for (const price of prices) {
    peak = Math.max(peak, price);

    if (peak > 0) {
      const drawdown = price / peak - 1;
      maxDrawdown = Math.min(maxDrawdown, drawdown);
    }
  }

  return maxDrawdown;
}

function getPeriodBaseIndex(
  klines: Kline[],
  period: PerformancePeriod,
): number {
  const latest = klines.at(-1);
  if (!latest) return -1;

  const latestDate = toDate(latest.date);

  let targetDate: Date;

  if (period === "ytd") {
    targetDate = new Date(Date.UTC(latestDate.getUTCFullYear(), 0, 1));
  } else {
    targetDate = subtractPeriod(latestDate, period);
  }

  const target = toDateNumber(targetDate);

  // 找到目标日期之前最近一个交易日，作为收益基准
  let baseIndex = -1;

  for (let i = 0; i < klines.length; i++) {
    if (klines[i].date < target) {
      baseIndex = i;
    } else {
      break;
    }
  }

  return baseIndex;
}

function classifyReturn(value: number | null): string {
  if (value === null) return "unknown";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "flat";
}

function classifyVolatility(value: number | null): string {
  if (value === null) return "unknown";
  if (value < 0.15) return "low";
  if (value < 0.3) return "medium";
  return "high";
}

function classifyDrawdown(value: number | null): string {
  if (value === null) return "unknown";
  if (value > -0.05) return "low";
  if (value > -0.15) return "medium";
  return "high";
}

function calculatePeriodPerformance(
  klines: Kline[],
  period: PerformancePeriod,
): PeriodPerformance {
  const empty: PeriodPerformance = {
    startDate: null,
    endDate: klines.at(-1)?.date ?? null,
    tradingDays: 0,

    totalReturn: metric(null, "unknown"),
    annualizedReturn: metric(null, "unknown"),
    dailyReturnMean: metric(null, "unknown"),
    dailyReturnMedian: metric(null, "unknown"),

    volatility: metric(null, "unknown"),
    maxDrawdown: metric(null, "unknown"),

    upDays: 0,
    downDays: 0,
    flatDays: 0,
    upDayRatio: null,
    downDayRatio: null,

    maxConsecutiveUpDays: 0,
    maxConsecutiveDownDays: 0,
    currentConsecutiveUpDays: 0,
    currentConsecutiveDownDays: 0,

    averageUpReturn: null,
    averageDownReturn: null,
    largestDailyGain: null,
    largestDailyLoss: null,
    gainLossRatio: null,

    averageAmount: null,
    medianAmount: null,
    minAmount: null,
    maxAmount: null,
    amountStdDev: null,
    amountChange: null,
    activeDays: 0,
    activeDayRatio: null,
  };

  if (klines.length < 2) return empty;

  const baseIndex = getPeriodBaseIndex(klines, period);

  if (baseIndex < 0 || baseIndex >= klines.length - 1) {
    return empty;
  }

  const base = klines[baseIndex];
  const samples = klines.slice(baseIndex + 1);

  if (!samples.length || base.close <= 0) return empty;

  const prices = [base.close, ...samples.map((item) => item.close)];

  const dailyReturns: number[] = [];

  let previousClose = base.close;

  for (const item of samples) {
    if (previousClose > 0) {
      dailyReturns.push(item.close / previousClose - 1);
    }
    previousClose = item.close;
  }

  const totalReturn = samples.at(-1)!.close / base.close - 1;

  const annualizedReturn =
    totalReturn > -1
      ? (1 + totalReturn) ** (TRADING_DAYS_PER_YEAR / dailyReturns.length) - 1
      : -1;

  const dailyMean = mean(dailyReturns);
  const dailyMedian = median(dailyReturns);

  const volatility = standardDeviation(dailyReturns);
  const annualizedVolatility =
    volatility === null ? null : volatility * Math.sqrt(TRADING_DAYS_PER_YEAR);

  const drawdown = calculateMaxDrawdown(prices);

  const upReturns = dailyReturns.filter((value) => value > 0);
  const downReturns = dailyReturns.filter((value) => value < 0);

  const upDays = upReturns.length;
  const downDays = downReturns.length;
  const flatDays = dailyReturns.length - upDays - downDays;

  const upSequence = calculateConsecutiveDays(dailyReturns, "up");

  const downSequence = calculateConsecutiveDays(dailyReturns, "down");

  const averageUpReturn = mean(upReturns);
  const averageDownReturn = mean(downReturns);

  const gainLossRatio =
    averageUpReturn !== null &&
    averageDownReturn !== null &&
    averageDownReturn !== 0
      ? averageUpReturn / Math.abs(averageDownReturn)
      : null;

  const amounts = samples.map((item) => item.amount).filter(isFiniteNumber);

  const averageAmount = mean(amounts);
  const latestAmount = samples.at(-1)?.amount ?? null;

  const amountChange =
    averageAmount !== null && averageAmount > 0 && latestAmount !== null
      ? latestAmount / averageAmount - 1
      : null;

  const activeDays = amounts.filter((value) => value > 0).length;

  return {
    startDate: base.date,
    endDate: samples.at(-1)!.date,
    tradingDays: dailyReturns.length,

    totalReturn: metric(round(totalReturn), classifyReturn(totalReturn)),

    annualizedReturn: metric(
      round(annualizedReturn),
      classifyReturn(annualizedReturn),
    ),

    dailyReturnMean: metric(
      dailyMean === null ? null : round(dailyMean),
      classifyReturn(dailyMean),
    ),

    dailyReturnMedian: metric(
      dailyMedian === null ? null : round(dailyMedian),
      classifyReturn(dailyMedian),
    ),

    volatility: metric(
      annualizedVolatility === null ? null : round(annualizedVolatility),
      classifyVolatility(annualizedVolatility),
    ),

    maxDrawdown: metric(
      drawdown === null ? null : round(drawdown),
      classifyDrawdown(drawdown),
    ),

    upDays,
    downDays,
    flatDays,

    upDayRatio: round(upDays / dailyReturns.length),
    downDayRatio: round(downDays / dailyReturns.length),

    maxConsecutiveUpDays: upSequence.max,
    maxConsecutiveDownDays: downSequence.max,
    currentConsecutiveUpDays: upSequence.current,
    currentConsecutiveDownDays: downSequence.current,

    averageUpReturn: averageUpReturn === null ? null : round(averageUpReturn),

    averageDownReturn:
      averageDownReturn === null ? null : round(averageDownReturn),

    largestDailyGain: max(upReturns) === null ? null : round(max(upReturns)!),

    largestDailyLoss:
      min(downReturns) === null ? null : round(min(downReturns)!),

    gainLossRatio: gainLossRatio === null ? null : round(gainLossRatio),

    averageAmount: averageAmount === null ? null : round(averageAmount),

    medianAmount: median(amounts) === null ? null : round(median(amounts)!),

    minAmount: min(amounts) === null ? null : round(min(amounts)!),

    maxAmount: max(amounts) === null ? null : round(max(amounts)!),

    amountStdDev:
      standardDeviation(amounts) === null
        ? null
        : round(standardDeviation(amounts)!),

    amountChange: amountChange === null ? null : round(amountChange),

    activeDays,
    activeDayRatio: amounts.length ? round(activeDays / amounts.length) : null,
  };
}

function calculatePerformance(klines: Kline[]): PerformanceFeatures {
  return Object.fromEntries(
    PERFORMANCE_PERIODS.map((period) => [
      period,
      calculatePeriodPerformance(klines, period),
    ]),
  ) as PerformanceFeatures;
}

// ============================================================
// 13. 均线计算
// ============================================================

function calculateMA(
  closes: number[],
  period: number,
  endIndex = closes.length - 1,
): number | null {
  const startIndex = endIndex - period + 1;

  if (startIndex < 0 || endIndex >= closes.length) {
    return null;
  }

  const values = closes.slice(startIndex, endIndex + 1);

  if (values.length !== period) return null;

  return mean(values);
}

function calculateMAAt(
  closes: number[],
  period: number,
  index: number,
): number | null {
  return calculateMA(closes, period, index);
}

function calculateTrend(
  current: number | null,
  previous: number | null,
  threshold = 0.001,
): Trend {
  if (current === null || previous === null || previous === 0) {
    return "unknown";
  }

  const change = current / previous - 1;

  if (change > threshold) return "rising";
  if (change < -threshold) return "falling";

  return "flat";
}

function calculateCross(
  currentShort: number | null,
  currentLong: number | null,
  previousShort: number | null,
  previousLong: number | null,
): MACross {
  if (
    currentShort === null ||
    currentLong === null ||
    previousShort === null ||
    previousLong === null
  ) {
    return "unknown";
  }

  if (previousShort <= previousLong && currentShort > currentLong) {
    return "golden";
  }

  if (previousShort >= previousLong && currentShort < currentLong) {
    return "death";
  }

  return "none";
}
type MAKey = `ma${(typeof MA_PERIODS)[number]}`;

function calculateMovingAverages(klines: Kline[]): MovingAverages {
  const closes = klines.map((item) => item.close);
  const latestClose = closes.at(-1) ?? null;
  const latestIndex = closes.length - 1;

  const values = {} as Record<MAKey, number | null>;

  const analyses = {} as Record<MAKey, MAAnalysis>;

  for (const period of MA_PERIODS) {
    const key = `ma${period}` as const;

    const current = calculateMAAt(closes, period, latestIndex);

    const previous = calculateMAAt(closes, period, latestIndex - 5);

    values[key] = current;

    analyses[key] = {
      trend: calculateTrend(current, previous),
      pricePosition:
        current === null || latestClose === null
          ? "unknown"
          : latestClose >= current
            ? "above"
            : "below",
    };
  }

  const currentMA5 = values.ma5;
  const currentMA10 = values.ma10;
  const currentMA20 = values.ma20;
  const currentMA60 = values.ma60;

  const previousMA5 = calculateMAAt(closes, 5, latestIndex - 1);

  const previousMA20 = calculateMAAt(closes, 20, latestIndex - 1);

  const previousMA10 = calculateMAAt(closes, 10, latestIndex - 1);

  const previousMA60 = calculateMAAt(closes, 60, latestIndex - 1);

  const alignmentValues = [currentMA5, currentMA10, currentMA20, currentMA60];

  let alignment: MAAlignment = "unknown";

  if (alignmentValues.every(isFiniteNumber)) {
    const [ma5, ma10, ma20, ma60] = alignmentValues;

    if (ma5 > ma10 && ma10 > ma20 && ma20 > ma60) {
      alignment = "bullish";
    } else if (ma5 < ma10 && ma10 < ma20 && ma20 < ma60) {
      alignment = "bearish";
    } else {
      alignment = "mixed";
    }
  }

  const availableMAs = alignmentValues.filter(isFiniteNumber);

  const dispersion =
    availableMAs.length >= 2
      ? (Math.max(...availableMAs) - Math.min(...availableMAs)) /
        mean(availableMAs)!
      : null;

  return {
    ma5: metric(values.ma5 === null ? null : round(values.ma5), analyses.ma5),
    ma10: metric(
      values.ma10 === null ? null : round(values.ma10),
      analyses.ma10,
    ),
    ma20: metric(
      values.ma20 === null ? null : round(values.ma20),
      analyses.ma20,
    ),
    ma60: metric(
      values.ma60 === null ? null : round(values.ma60),
      analyses.ma60,
    ),
    ma120: metric(
      values.ma120 === null ? null : round(values.ma120),
      analyses.ma120,
    ),
    ma250: metric(
      values.ma250 === null ? null : round(values.ma250),
      analyses.ma250,
    ),

    analysis: {
      alignment,
      cross: {
        ma5Ma20: calculateCross(
          currentMA5,
          currentMA20,
          previousMA5,
          previousMA20,
        ),
        ma10Ma60: calculateCross(
          currentMA10,
          currentMA60,
          previousMA10,
          previousMA60,
        ),
      },
      dispersion: dispersion === null ? null : round(dispersion),
    },
  };
}

// ============================================================
// 14. 均线偏离计算
// ============================================================

function classifyDeviation(value: number | null): DeviationStatus {
  if (value === null) return "unknown";

  if (value < -0.1) return "deeply_below";
  if (value < -0.05) return "below";
  if (value <= 0.05) return "near";
  if (value <= 0.1) return "above";

  return "deeply_above";
}

function calculateMADeviation(
  klines: Kline[],
  movingAverages: MovingAverages,
): MADeviation {
  const close = klines.at(-1)?.close ?? null;

  function calculate(
    ma: Metric<Nullable<number>, MAAnalysis>,
  ): Metric<Nullable<number>, DeviationStatus> {
    if (close === null || ma.value === null || ma.value === 0) {
      return metric(null, "unknown");
    }

    const value = close / ma.value - 1;

    return metric(round(value), classifyDeviation(value));
  }

  return {
    ma5: calculate(movingAverages.ma5),
    ma10: calculate(movingAverages.ma10),
    ma20: calculate(movingAverages.ma20),
    ma60: calculate(movingAverages.ma60),
    ma120: calculate(movingAverages.ma120),
    ma250: calculate(movingAverages.ma250),
  };
}

// ============================================================
// 15. 周 K / 月 K 聚合
// ============================================================

interface AggregatedKline {
  date: number;
  high: number;
  low: number;
  close: number;
}

function getISOWeekKey(date: number): string {
  const d = toDate(date);
  const day = d.getUTCDay() || 7;

  d.setUTCDate(d.getUTCDate() + 4 - day);

  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));

  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );

  return `${year}-${week}`;
}

function aggregateKlines(
  klines: Kline[],
  type: "weekly" | "monthly",
): AggregatedKline[] {
  const groups = new Map<string, Kline[]>();

  for (const item of klines) {
    const date = toDate(item.date);

    const key =
      type === "weekly"
        ? getISOWeekKey(item.date)
        : `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;

    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    date: group.at(-1)!.date,
    high: Math.max(...group.map((item) => item.high)),
    low: Math.min(...group.map((item) => item.low)),
    close: group.at(-1)!.close,
  }));
}

// ============================================================
// 16. 布林带计算
// ============================================================

interface BollingerPoint {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;
}

function calculateBollingerAt(
  closes: number[],
  endIndex: number,
): BollingerPoint | null {
  const startIndex = endIndex - BOLLINGER_PERIOD + 1;

  if (startIndex < 0) return null;

  const values = closes.slice(startIndex, endIndex + 1);

  if (values.length !== BOLLINGER_PERIOD) {
    return null;
  }

  const middle = mean(values);

  if (middle === null || middle <= 0) return null;

  // BOLL 使用总体标准差
  const variance =
    values.reduce((sum, value) => sum + (value - middle) ** 2, 0) /
    values.length;

  const sd = Math.sqrt(variance);

  const upper = middle + BOLLINGER_MULTIPLIER * sd;

  const lower = middle - BOLLINGER_MULTIPLIER * sd;

  const bandwidth = (upper - lower) / middle;

  const latestClose = closes[endIndex];

  const percentB =
    upper === lower ? 0.5 : (latestClose - lower) / (upper - lower);

  return {
    upper,
    middle,
    lower,
    bandwidth,
    percentB,
  };
}

function calculateBandwidthTrend(
  current: number | null,
  previous: number | null,
): BandwidthTrend {
  if (current === null || previous === null || previous === 0) {
    return "unknown";
  }

  const change = current / previous - 1;

  if (change > 0.05) return "expanding";
  if (change < -0.05) return "contracting";

  return "stable";
}

function calculateBollingerPosition(
  close: number | null,
  bands: BollingerPoint | null,
): BollingerPosition {
  if (close === null || bands === null) {
    return "unknown";
  }

  if (close > bands.upper) return "above_upper";
  if (close < bands.lower) return "below_lower";
  if (close >= bands.middle) return "upper_half";

  return "lower_half";
}

function calculateBollingerSignal(
  currentClose: number | null,
  currentBands: BollingerPoint | null,
  previousClose: number | null,
  previousBands: BollingerPoint | null,
): BollingerSignal {
  if (
    currentClose === null ||
    currentBands === null ||
    previousClose === null ||
    previousBands === null
  ) {
    return "unknown";
  }

  if (
    previousClose <= previousBands.upper &&
    currentClose > currentBands.upper
  ) {
    return "breakout_upper";
  }

  if (
    previousClose >= previousBands.lower &&
    currentClose < currentBands.lower
  ) {
    return "breakout_lower";
  }

  if (
    previousClose <= previousBands.middle &&
    currentClose > currentBands.middle
  ) {
    return "cross_above_middle";
  }

  if (
    previousClose >= previousBands.middle &&
    currentClose < currentBands.middle
  ) {
    return "cross_below_middle";
  }

  return "none";
}

function calculateSqueeze(
  bandwidths: number[],
  current: number | null,
): boolean | null {
  if (current === null || bandwidths.length < 20) {
    return null;
  }

  const sorted = [...bandwidths].sort((a, b) => a - b);

  // 当前带宽处于最近 120 个有效周期的 20% 分位以下
  const index = Math.floor((sorted.length - 1) * 0.2);
  const threshold = sorted[index];

  return current <= threshold;
}

function calculateBollingerPeriod(closes: number[]): BollingerPeriod {
  const latestIndex = closes.length - 1;

  const current = calculateBollingerAt(closes, latestIndex);

  const previous = calculateBollingerAt(closes, latestIndex - 1);

  const middlePrevious = calculateBollingerAt(closes, latestIndex - 5);

  const currentClose = closes.at(-1) ?? null;
  const previousClose = closes.at(-2) ?? null;

  const bandwidthHistory: number[] = [];

  // 最近最多 120 个有效周期的带宽
  const startIndex = Math.max(BOLLINGER_PERIOD - 1, latestIndex - 119);

  for (let i = startIndex; i <= latestIndex; i++) {
    const point = calculateBollingerAt(closes, i);

    if (point) {
      bandwidthHistory.push(point.bandwidth);
    }
  }

  const middleTrend = calculateTrend(
    current?.middle ?? null,
    middlePrevious?.middle ?? null,
  );

  const bands: BollingerBands = {
    upper: metric(current ? round(current.upper) : null),
    middle: metric(current ? round(current.middle) : null),
    lower: metric(current ? round(current.lower) : null),
    bandwidth: metric(current ? round(current.bandwidth) : null),
    percentB: metric(current ? round(current.percentB) : null),
  };

  return {
    value: bands,

    analysis: {
      position: calculateBollingerPosition(currentClose, current),

      bandwidthTrend: calculateBandwidthTrend(
        current?.bandwidth ?? null,
        previous?.bandwidth ?? null,
      ),

      squeeze: calculateSqueeze(bandwidthHistory, current?.bandwidth ?? null),

      priceSignal: calculateBollingerSignal(
        currentClose,
        current,
        previousClose,
        previous,
      ),

      middleTrend,
    },
  };
}

function calculateBollinger(klines: Kline[]): BollingerFeatures {
  const dailyCloses = klines.map((item) => item.close);

  const weekly = aggregateKlines(klines, "weekly");
  const monthly = aggregateKlines(klines, "monthly");

  return {
    daily: calculateBollingerPeriod(dailyCloses),

    weekly: calculateBollingerPeriod(weekly.map((item) => item.close)),

    monthly: calculateBollingerPeriod(monthly.map((item) => item.close)),
  };
}

// ============================================================
// 17. 估值计算
// ============================================================

function getValuationStatus(percentile: number | null): AnalysisStatus {
  if (percentile === null) return "unknown";

  if (percentile < 0.1) return "very_low";
  if (percentile < 0.3) return "low";
  if (percentile < 0.7) return "neutral";
  if (percentile < 0.9) return "high";

  return "very_high";
}

function calculatePercentile(values: number[], current: number): number | null {
  if (!values.length) return null;

  const count = values.filter((value) => value <= current).length;

  return count / values.length;
}

function calculateValuationHistory(
  records: Valuation[],
  currentValue: number,
  period: ValuationPeriod,
  latestDate: number,
): ValuationHistory {
  let samples = records;

  if (period !== "all") {
    const years = Number.parseInt(period, 10);
    const targetDate = toDate(latestDate);
    targetDate.setUTCFullYear(targetDate.getUTCFullYear() - years);

    const minDate = toDateNumber(targetDate);

    samples = records.filter((item) => item.date >= minDate);
  }

  const values = samples
    .map((item) => item.value)
    .filter((value) => value > 0 && isFiniteNumber(value));

  if (!values.length) {
    return {
      min: null,
      max: null,
      mean: null,
      median: null,
      stdDev: null,
      percentile: null,
      deviation: null,
      zScore: null,
    };
  }

  const avg = mean(values)!;
  const med = median(values)!;
  const sd = standardDeviation(values);

  return {
    min: round(min(values)!),
    max: round(max(values)!),
    mean: round(avg),
    median: round(med),
    stdDev: sd === null ? null : round(sd),

    percentile: round(calculatePercentile(values, currentValue)!),

    deviation: med === 0 ? null : round(currentValue / med - 1),

    zScore: sd === null || sd === 0 ? null : round((currentValue - avg) / sd),
  };
}

function createEmptyValuation(): SingleValuationFeature {
  const emptyHistory: ValuationHistory = {
    min: null,
    max: null,
    mean: null,
    median: null,
    stdDev: null,
    percentile: null,
    deviation: null,
    zScore: null,
  };

  return {
    value: null,

    analysis: {
      status: "unknown",
      history: {
        "1y": { ...emptyHistory },
        "3y": { ...emptyHistory },
        "5y": { ...emptyHistory },
        all: { ...emptyHistory },
      },
    },

    peg: null,
    date: null,
    delayDays: null,
  };
}

function calculateSingleValuation(
  records: Valuation[],
  latestDate: number,
): SingleValuationFeature {
  if (!records.length) {
    return createEmptyValuation();
  }

  // 只取 ETF 最新行情日期及之前的数据
  const validRecords = records
    .filter((item) => item.date <= latestDate)
    .filter((item) => item.value > 0)
    .sort((a, b) => a.date - b.date);

  const latest = validRecords.at(-1);

  if (!latest) {
    return createEmptyValuation();
  }

  const history = {} as Record<ValuationPeriod, ValuationHistory>;

  for (const period of VALUATION_PERIODS) {
    history[period] = calculateValuationHistory(
      validRecords,
      latest.value,
      period,
      latest.date,
    );
  }

  const percentile = history["3y"].percentile;

  return {
    value: round(latest.value),

    analysis: {
      status: getValuationStatus(percentile),
      history,
    },

    peg: latest.peg ?? null,
    date: latest.date,
    delayDays: dateDiffDays(latest.date, latestDate),
  };
}

function calculateValuation(
  valuations: Valuation[],
  latestDate: number,
): ValuationFeatures {
  return {
    PE: calculateSingleValuation(
      valuations.filter((item) => item.type === "PE"),
      latestDate,
    ),

    PB: calculateSingleValuation(
      valuations.filter((item) => item.type === "PB"),
      latestDate,
    ),

    PS: calculateSingleValuation(
      valuations.filter((item) => item.type === "PS"),
      latestDate,
    ),
  };
}

// ============================================================
// 18. 主入口
// ============================================================

export function calculateEtfFeatures(klines: Kline[], valuations: Valuation[]) {
  const latest = klines.at(-1);
  const latestDate = latest?.date ?? 0;

  const movingAverages = calculateMovingAverages(klines);

  return {
    changePercent: latest?.changePercent,

    performance: calculatePerformance(klines),

    movingAverages,

    maDeviation: calculateMADeviation(klines, movingAverages),

    bollinger: calculateBollinger(klines),

    valuation: calculateValuation(valuations, latestDate),
  };
}
