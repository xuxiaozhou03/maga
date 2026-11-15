/**
 * ETF 单只特征计算 V1
 *
 * 输入类型：Etf、Kline、Valuation（使用项目已有定义）
 *
 * 单位约定：
 * - premiumRate：百分数，例如 -0.24 表示 -0.24%
 * - changePercent：百分数，例如 -1.5 表示 -1.5%
 * - Valuation.percent：0～1，例如 0.7376 表示 73.76%
 * - returns / volatility / drawdown / deviation：小数
 * - amount / volume / scale：保留上游单位
 */

import { Etf } from "./etfs";
import { Kline } from "./klines";
import { Valuation } from "./valuation";

// ==================================================
// 1. 返回类型定义
// ==================================================

export type ReturnPeriod =
  | "d1"
  | "d5"
  | "d20"
  | "d60"
  | "d120"
  | "d250"
  | "ytd";

export type StatisticsPeriod = "1m" | "3m" | "6m" | "ytd" | "1y" | "2y";

export type ValuationType = "PE" | "PB" | "PS";

export interface MovingAverages {
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ma250: number | null;
}

export interface BollingerBands {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  bandwidth: number | null;
  position: number | null;
}

export interface PeriodStatistics {
  /** 区间第一交易日 */
  startDate: number | null;
  /** 最新交易日 */
  endDate: number | null;
  /** 区间收益率样本数 */
  tradingDays: number;
  totalReturn: number | null;
  annualizedReturn: number | null;
  dailyReturnMean: number | null;
  dailyReturnMedian: number | null;
  dailyReturnStdDev: number | null;
  upDays: number;
  downDays: number;
  upDayRatio: number | null;
  maxDrawdown: number | null;
}

export interface RiskFeatures {
  volatility20: number | null;
  volatility60: number | null;
  volatility120: number | null;
  maxDrawdown20: number | null;
  maxDrawdown60: number | null;
  maxDrawdown120: number | null;
  maxDrawdown250: number | null;
}

export interface VolumeFeatures {
  latestAmount: number | null;
  averageAmount5: number | null;
  averageAmount20: number | null;
  amountRatio20: number | null;
  amountChange20: number | null;
}

export interface ValuationFeature {
  value: number | null;
  percentile: number | null;
  peg: number | null;
  date: number | null;
  delayDays: number | null;
}

export interface ValuationFeatures {
  PE: ValuationFeature;
  PB: ValuationFeature;
  PS: ValuationFeature;
}

export interface EtfFeatures {
  code: string;
  name: string;
  trackingIndex: string;
  trackIndex: string;
  scale: number;
  premiumRate: number | null;

  data: {
    latestDate: number | null;
    earliestDate: number | null;
    totalTradingDays: number;
  };

  market: {
    close: number | null;
    change: number | null;
    changePercent: number | null;
    high: number | null;
    low: number | null;
    volume: number | null;
    amount: number | null;
  };

  returns: Record<ReturnPeriod, number | null>;
  statistics: Record<StatisticsPeriod, PeriodStatistics>;

  movingAverages: MovingAverages;
  maDeviation: MovingAverages;

  bollinger: {
    daily: BollingerBands;
    weekly: BollingerBands;
    monthly: BollingerBands;
  };

  risk: RiskFeatures;
  volume: VolumeFeatures;
  valuation: ValuationFeatures;
}

// ==================================================
// 2. 常量和通用函数
// ==================================================

const TRADING_DAYS_PER_YEAR = 250;

const MA_PERIODS = [5, 10, 20, 60, 120, 250] as const;

const EMPTY_MA: MovingAverages = {
  ma5: null,
  ma10: null,
  ma20: null,
  ma60: null,
  ma120: null,
  ma250: null,
};

const EMPTY_BOLL: BollingerBands = {
  upper: null,
  middle: null,
  lower: null,
  bandwidth: null,
  position: null,
};

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, digits = 8): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** 样本标准差 */
function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null;

  const avg = mean(values)!;
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}

/** 总体标准差 */
function populationStdDev(values: number[]): number | null {
  if (!values.length) return null;

  const avg = mean(values)!;
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;

  return Math.sqrt(variance);
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

function isValidDateNumber(date: number): boolean {
  if (!Number.isInteger(date)) return false;

  const parsed = toDate(date);
  return toDateNumber(parsed) === date;
}

function daysBetween(start: number, end: number): number {
  return Math.floor(
    (toDate(end).getTime() - toDate(start).getTime()) / 86400000,
  );
}

function subtractMonths(date: number, months: number): number {
  const source = toDate(date);

  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();

  const target = new Date(Date.UTC(year, month - months, 1));

  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  target.setUTCDate(Math.min(day, lastDay));

  return toDateNumber(target);
}

// ==================================================
// 3. K线清洗
// ==================================================

/**
 * 只保留当前 ETF 的有效日K。
 * 同日期重复时保留输入数组中最后一条有效记录。
 */
function normalizeKlines(etfCode: string, klines: Kline[]): Kline[] {
  const map = new Map<number, Kline>();

  for (const item of klines) {
    if (item.code !== etfCode) continue;
    if (!isValidDateNumber(item.date)) continue;

    if (
      !isValidNumber(item.open) ||
      !isValidNumber(item.high) ||
      !isValidNumber(item.low) ||
      !isValidNumber(item.close)
    ) {
      continue;
    }

    if (
      item.open <= 0 ||
      item.high <= 0 ||
      item.low <= 0 ||
      item.close <= 0 ||
      item.high < item.low
    ) {
      continue;
    }

    map.set(item.date, { ...item });
  }

  return [...map.values()].sort((a, b) => a.date - b.date);
}

function getDailyReturns(klines: Kline[]): number[] {
  const result: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const previous = klines[i - 1].close;
    const current = klines[i].close;

    if (previous <= 0) continue;
    result.push(current / previous - 1);
  }

  return result;
}

// ==================================================
// 4. 收益率
// ==================================================

/** 最近 N 个交易日收益，需要 N+1 根日K */
function calculateReturn(klines: Kline[], period: number): number | null {
  if (klines.length < period + 1) return null;

  const latest = klines[klines.length - 1];
  const base = klines[klines.length - 1 - period];

  return round(latest.close / base.close - 1);
}

/**
 * 根据自然日期计算区间收益。
 *
 * 使用目标日期之前最近一个交易日的收盘价作为基准。
 * 如果历史数据中没有这个基准交易日，则返回 null。
 */
function calculateCalendarReturn(
  klines: Kline[],
  targetDate: number,
): number | null {
  const firstIndex = klines.findIndex((item) => item.date >= targetDate);

  if (firstIndex <= 0) return null;

  const base = klines[firstIndex - 1];
  const latest = klines[klines.length - 1];

  return round(latest.close / base.close - 1);
}

function calculateReturns(
  klines: Kline[],
): Record<ReturnPeriod, number | null> {
  const latest = klines[klines.length - 1];

  if (!latest) {
    return {
      d1: null,
      d5: null,
      d20: null,
      d60: null,
      d120: null,
      d250: null,
      ytd: null,
    };
  }

  const yearStart = Math.floor(latest.date / 10000) * 10000 + 101;

  return {
    d1: calculateReturn(klines, 1),
    d5: calculateReturn(klines, 5),
    d20: calculateReturn(klines, 20),
    d60: calculateReturn(klines, 60),
    d120: calculateReturn(klines, 120),
    d250: calculateReturn(klines, 250),
    ytd: calculateCalendarReturn(klines, yearStart),
  };
}

// ==================================================
// 5. 均线和均线偏离
// ==================================================

function calculateMA(klines: Kline[], period: number): number | null {
  if (klines.length < period) return null;

  const values = klines.slice(-period).map((item) => item.close);

  const result = mean(values);
  return result === null ? null : round(result);
}

function calculateMovingAverages(klines: Kline[]): MovingAverages {
  const result = {} as MovingAverages;

  for (const period of MA_PERIODS) {
    const key = `ma${period}` as keyof MovingAverages;
    result[key] = calculateMA(klines, period);
  }

  return result;
}

function calculateMADeviation(
  close: number | null,
  averages: MovingAverages,
): MovingAverages {
  const result = {} as MovingAverages;

  for (const period of MA_PERIODS) {
    const key = `ma${period}` as keyof MovingAverages;
    const ma = averages[key];

    result[key] =
      close !== null && ma !== null && ma !== 0 ? round(close / ma - 1) : null;
  }

  return result;
}

// ==================================================
// 6. 布林带
// ==================================================

/** BOLL(20, 2)，使用总体标准差 */
function calculateBollinger(klines: Kline[]): BollingerBands {
  if (klines.length < 20) return { ...EMPTY_BOLL };

  const closes = klines.slice(-20).map((item) => item.close);

  const middle = mean(closes);
  const stdDev = populationStdDev(closes);

  if (middle === null || stdDev === null || middle === 0) {
    return { ...EMPTY_BOLL };
  }

  const upper = middle + 2 * stdDev;
  const lower = middle - 2 * stdDev;
  const latestClose = closes[closes.length - 1];

  return {
    upper: round(upper),
    middle: round(middle),
    lower: round(lower),
    bandwidth: round((upper - lower) / middle),
    position:
      upper === lower ? null : round((latestClose - lower) / (upper - lower)),
  };
}

// ==================================================
// 7. 周K / 月K
// ==================================================

function getWeekStart(date: number): number {
  const d = toDate(date);
  const weekday = d.getUTCDay() || 7;

  d.setUTCDate(d.getUTCDate() - weekday + 1);
  return toDateNumber(d);
}

function getMonthStart(date: number): number {
  const d = toDate(date);

  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + 1;
}

function aggregateKlines(klines: Kline[], type: "weekly" | "monthly"): Kline[] {
  const groups = new Map<number, Kline[]>();

  for (const item of klines) {
    const key =
      type === "weekly" ? getWeekStart(item.date) : getMonthStart(item.date);

    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const result: Kline[] = [];

  for (const group of groups.values()) {
    const first = group[0];
    const last = group[group.length - 1];

    const high = Math.max(...group.map((item) => item.high));
    const low = Math.min(...group.map((item) => item.low));

    const volumeValues = group.map((item) => item.volume);
    const amountValues = group.map((item) => item.amount);

    const volume = volumeValues.every(isValidNumber)
      ? volumeValues.reduce((sum, value) => sum + value, 0)
      : NaN;

    const amount = amountValues.every(isValidNumber)
      ? amountValues.reduce((sum, value) => sum + value, 0)
      : NaN;

    const change = last.close - first.open;

    result.push({
      code: first.code,
      date: last.date,
      open: first.open,
      high,
      low,
      close: last.close,
      volume,
      amount,
      change,
      changePercent: first.open > 0 ? (change / first.open) * 100 : NaN,
    });
  }

  return result.sort((a, b) => a.date - b.date);
}

// ==================================================
// 8. 风险指标
// ==================================================

/** 收盘价最大回撤，负数表示回撤 */
function calculateMaxDrawdown(klines: Kline[], period?: number): number | null {
  const data = period === undefined ? klines : klines.slice(-period);

  if (data.length < 2) return null;

  let peak = data[0].close;
  let maxDrawdown = 0;

  for (const item of data) {
    peak = Math.max(peak, item.close);

    const drawdown = item.close / peak - 1;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
  }

  return round(maxDrawdown);
}

/** 年化波动率：日收益率样本标准差 × √250 */
function calculateVolatility(klines: Kline[], period: number): number | null {
  if (klines.length < period + 1) return null;

  const data = klines.slice(-(period + 1));
  const returns = getDailyReturns(data);

  if (returns.length !== period) return null;

  const stdDev = sampleStdDev(returns);

  return stdDev === null
    ? null
    : round(stdDev * Math.sqrt(TRADING_DAYS_PER_YEAR));
}

function calculateRisk(klines: Kline[]): RiskFeatures {
  return {
    volatility20: calculateVolatility(klines, 20),
    volatility60: calculateVolatility(klines, 60),
    volatility120: calculateVolatility(klines, 120),

    maxDrawdown20: calculateMaxDrawdown(klines, 20),
    maxDrawdown60: calculateMaxDrawdown(klines, 60),
    maxDrawdown120: calculateMaxDrawdown(klines, 120),
    maxDrawdown250: calculateMaxDrawdown(klines, 250),
  };
}

// ==================================================
// 9. 历史区间统计
// ==================================================

function emptyStatistics(): PeriodStatistics {
  return {
    startDate: null,
    endDate: null,
    tradingDays: 0,
    totalReturn: null,
    annualizedReturn: null,
    dailyReturnMean: null,
    dailyReturnMedian: null,
    dailyReturnStdDev: null,
    upDays: 0,
    downDays: 0,
    upDayRatio: null,
    maxDrawdown: null,
  };
}

function calculatePeriodStatistics(
  klines: Kline[],
  targetDate: number,
): PeriodStatistics {
  const firstIndex = klines.findIndex((item) => item.date >= targetDate);

  // 必须有目标区间之前的基准收盘价
  if (firstIndex <= 0) return emptyStatistics();

  const data = klines.slice(firstIndex - 1);

  if (data.length < 2) return emptyStatistics();

  const returns = getDailyReturns(data);
  if (!returns.length) return emptyStatistics();

  const first = data[1];
  const latest = data[data.length - 1];

  const totalReturn = latest.close / data[0].close - 1;
  const tradingDays = returns.length;

  const annualizedReturn =
    totalReturn > -1
      ? (1 + totalReturn) ** (TRADING_DAYS_PER_YEAR / tradingDays) - 1
      : null;

  const upDays = returns.filter((value) => value > 0).length;
  const downDays = returns.filter((value) => value < 0).length;

  const avg = mean(returns);
  const med = median(returns);
  const std = sampleStdDev(returns);

  return {
    startDate: first.date,
    endDate: latest.date,
    tradingDays,
    totalReturn: round(totalReturn),
    annualizedReturn:
      annualizedReturn === null ? null : round(annualizedReturn),
    dailyReturnMean: avg === null ? null : round(avg),
    dailyReturnMedian: med === null ? null : round(med),
    dailyReturnStdDev: std === null ? null : round(std),
    upDays,
    downDays,
    upDayRatio: round(upDays / tradingDays),
    maxDrawdown: calculateMaxDrawdown(data),
  };
}

function calculateStatistics(
  klines: Kline[],
): Record<StatisticsPeriod, PeriodStatistics> {
  const latest = klines[klines.length - 1];

  if (!latest) {
    return {
      "1m": emptyStatistics(),
      "3m": emptyStatistics(),
      "6m": emptyStatistics(),
      ytd: emptyStatistics(),
      "1y": emptyStatistics(),
      "2y": emptyStatistics(),
    };
  }

  const yearStart = Math.floor(latest.date / 10000) * 10000 + 101;

  return {
    "1m": calculatePeriodStatistics(klines, subtractMonths(latest.date, 1)),
    "3m": calculatePeriodStatistics(klines, subtractMonths(latest.date, 3)),
    "6m": calculatePeriodStatistics(klines, subtractMonths(latest.date, 6)),
    ytd: calculatePeriodStatistics(klines, yearStart),
    "1y": calculatePeriodStatistics(klines, subtractMonths(latest.date, 12)),
    "2y": calculatePeriodStatistics(klines, subtractMonths(latest.date, 24)),
  };
}

// ==================================================
// 10. 成交指标
// ==================================================

function calculateAverageAmount(
  klines: Kline[],
  period: number,
): number | null {
  if (klines.length < period) return null;

  const values = klines.slice(-period).map((item) => item.amount);

  if (!values.every(isValidNumber)) return null;

  return round(values.reduce((sum, value) => sum + value, 0) / period, 2);
}

function calculateVolumeFeatures(klines: Kline[]): VolumeFeatures {
  const latest = klines[klines.length - 1];

  if (!latest) {
    return {
      latestAmount: null,
      averageAmount5: null,
      averageAmount20: null,
      amountRatio20: null,
      amountChange20: null,
    };
  }

  const latestAmount = isValidNumber(latest.amount)
    ? round(latest.amount, 2)
    : null;

  const averageAmount5 = calculateAverageAmount(klines, 5);
  const averageAmount20 = calculateAverageAmount(klines, 20);

  const amountRatio20 =
    latestAmount !== null && averageAmount20 !== null && averageAmount20 > 0
      ? round(latestAmount / averageAmount20)
      : null;

  return {
    latestAmount,
    averageAmount5,
    averageAmount20,
    amountRatio20,
    amountChange20: amountRatio20 === null ? null : round(amountRatio20 - 1),
  };
}

// ==================================================
// 11. 指数估值
// ==================================================

function emptyValuation(): ValuationFeature {
  return {
    value: null,
    percentile: null,
    peg: null,
    date: null,
    delayDays: null,
  };
}

function calculateSingleValuation(
  valuations: Valuation[],
  type: ValuationType,
  trackIndex: string,
  latestDate: number | null,
): ValuationFeature {
  if (latestDate === null) return emptyValuation();

  const candidates = valuations
    .filter(
      (item) =>
        item.code === trackIndex &&
        item.type === type &&
        item.date <= latestDate &&
        isValidDateNumber(item.date) &&
        isValidNumber(item.value),
    )
    .sort((a, b) => b.date - a.date);

  const latest = candidates[0];

  if (!latest) return emptyValuation();

  return {
    value: round(latest.value),

    // 上游已经是 0～1，不进行百分数转换
    percentile: isValidNumber(latest.percent) ? round(latest.percent) : null,

    peg: isValidNumber(latest.peg) ? round(latest.peg) : null,

    date: latest.date,
    delayDays: daysBetween(latest.date, latestDate),
  };
}

function calculateValuationFeatures(
  valuations: Valuation[],
  trackIndex: string,
  latestDate: number | null,
): ValuationFeatures {
  return {
    PE: calculateSingleValuation(valuations, "PE", trackIndex, latestDate),
    PB: calculateSingleValuation(valuations, "PB", trackIndex, latestDate),
    PS: calculateSingleValuation(valuations, "PS", trackIndex, latestDate),
  };
}

// ==================================================
// 12. 空结果
// ==================================================

function createEmptyEtfFeatures(etf: Etf): EtfFeatures {
  return {
    code: etf.code,
    name: etf.name,
    trackingIndex: etf.trackingIndex,
    trackIndex: etf.trackIndex,
    scale: etf.scale,
    premiumRate: etf.premiumRate ?? null,

    data: {
      latestDate: null,
      earliestDate: null,
      totalTradingDays: 0,
    },

    market: {
      close: null,
      change: null,
      changePercent: null,
      high: null,
      low: null,
      volume: null,
      amount: null,
    },

    returns: {
      d1: null,
      d5: null,
      d20: null,
      d60: null,
      d120: null,
      d250: null,
      ytd: null,
    },

    statistics: {
      "1m": emptyStatistics(),
      "3m": emptyStatistics(),
      "6m": emptyStatistics(),
      ytd: emptyStatistics(),
      "1y": emptyStatistics(),
      "2y": emptyStatistics(),
    },

    movingAverages: { ...EMPTY_MA },
    maDeviation: { ...EMPTY_MA },

    bollinger: {
      daily: { ...EMPTY_BOLL },
      weekly: { ...EMPTY_BOLL },
      monthly: { ...EMPTY_BOLL },
    },

    risk: {
      volatility20: null,
      volatility60: null,
      volatility120: null,
      maxDrawdown20: null,
      maxDrawdown60: null,
      maxDrawdown120: null,
      maxDrawdown250: null,
    },

    volume: {
      latestAmount: null,
      averageAmount5: null,
      averageAmount20: null,
      amountRatio20: null,
      amountChange20: null,
    },

    valuation: {
      PE: emptyValuation(),
      PB: emptyValuation(),
      PS: emptyValuation(),
    },
  };
}

// ==================================================
// 13. 核心函数
// ==================================================

export function calculateEtfFeatures(
  etf: Etf,
  klines: Kline[],
  valuations: Valuation[],
): EtfFeatures {
  const data = normalizeKlines(etf.code, klines);

  if (!data.length) {
    return createEmptyEtfFeatures(etf);
  }

  const latest = data[data.length - 1];
  const earliest = data[0];

  const movingAverages = calculateMovingAverages(data);

  const weeklyKlines = aggregateKlines(data, "weekly");
  const monthlyKlines = aggregateKlines(data, "monthly");

  return {
    code: etf.code,
    name: etf.name,
    trackingIndex: etf.trackingIndex,
    trackIndex: etf.trackIndex,
    scale: etf.scale,
    premiumRate: etf.premiumRate ?? null,

    data: {
      latestDate: latest.date,
      earliestDate: earliest.date,
      totalTradingDays: data.length,
    },

    market: {
      close: round(latest.close),
      change: isValidNumber(latest.change) ? round(latest.change) : null,
      changePercent: isValidNumber(latest.changePercent)
        ? round(latest.changePercent)
        : null,
      high: isValidNumber(latest.high) ? round(latest.high) : null,
      low: isValidNumber(latest.low) ? round(latest.low) : null,
      volume: isValidNumber(latest.volume) ? round(latest.volume, 2) : null,
      amount: isValidNumber(latest.amount) ? round(latest.amount, 2) : null,
    },

    returns: calculateReturns(data),
    statistics: calculateStatistics(data),

    movingAverages,
    maDeviation: calculateMADeviation(latest.close, movingAverages),

    bollinger: {
      daily: calculateBollinger(data),
      weekly: calculateBollinger(weeklyKlines),
      monthly: calculateBollinger(monthlyKlines),
    },

    risk: calculateRisk(data),
    volume: calculateVolumeFeatures(data),

    valuation: calculateValuationFeatures(
      valuations,
      etf.trackIndex,
      latest.date,
    ),
  };
}
