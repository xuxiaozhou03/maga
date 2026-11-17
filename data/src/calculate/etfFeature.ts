import { Kline } from "../fetch/klines";
import { Valuation } from "../fetch/valuation";

// ============================================================
// 1. 基础类型
// ============================================================

/** 可空类型：允许指定类型的值为 null */
export type Nullable<T> = T | null;

/** 趋势方向 */
export type Trend =
  | "rising" // 上升
  | "falling" // 下降
  | "flat" // 横盘
  | "unknown"; // 未知，数据不足或无法判断

/** 指标分析状态，主要用于描述指标在历史区间中的相对水平 */
export type AnalysisStatus =
  | "very_low" // 极低
  | "low" // 偏低
  | "neutral" // 中性
  | "high" // 偏高
  | "very_high" // 极高
  | "unknown"; // 未知

/**
 * 通用指标结构
 *
 * value：指标实际计算值
 * analysis：指标对应的分析结论
 */
export interface Metric<T, A = null> {
  value: T;
  analysis: A;
}

// ============================================================
// 2. 数据与行情
// ============================================================

/** ETF 历史行情数据的基本信息 */
export interface DataFeatures {
  latestDate: number; // 最新一条 K 线日期，格式 YYYYMMDD
  earliestDate: number; // 最早一条 K 线日期，格式 YYYYMMDD
  totalTradingDays: number; // 历史交易日总数量
}

/** ETF 最新交易日的行情数据 */
export interface MarketFeatures {
  close: number; // 最新收盘价
  change: number; // 最新涨跌额
  changePercent: number; // 最新涨跌幅，小数表示，例如 0.02 = 2%

  high: number; // 最新交易日最高价
  low: number; // 最新交易日最低价

  volume: number; // 最新交易日成交量
  amount: number; // 最新交易日成交额
}

// ============================================================
// 3. 多周期表现
// ============================================================

/** 多周期表现统计范围 */
export type PerformancePeriod =
  | "1w" // 近一周
  | "1m" // 近一个月
  | "3m" // 近三个月
  | "6m" // 近六个月
  | "ytd" // 今年以来
  | "1y" // 近一年
  | "3y" // 近三年
  | "5y" // 近五年
  | "all"; // 成立以来

/** 单个周期的完整表现统计 */
export interface PeriodPerformance {
  // 收益统计
  totalReturn: number; // 周期累计收益率
  annualizedReturn: number; // 周期年化收益率
  dailyReturnMean: number; // 日收益率算术平均值
  dailyReturnMedian: number; // 日收益率中位数

  // 风险统计
  volatility: number; // 年化波动率，
  // analysis：low / medium / high / unknown
  volatilityAnalysis: "low" | "medium" | "high" | "unknown";
  maxDrawdown: number; // 周期最大回撤，
  // analysis：low / medium / high / unknown
  maxDrawdownAnalysis: "low" | "medium" | "high" | "unknown";

  // 涨跌统计
  upDays: number; // 上涨交易日数量
  downDays: number; // 下跌交易日数量
  flatDays: number; // 平盘交易日数量
  upDayRatio: number | null; // 上涨交易日占比
  downDayRatio: number | null; // 下跌交易日占比

  // 连续涨跌统计
  maxConsecutiveUpDays: number; // 周期内最大连续上涨天数
  maxConsecutiveDownDays: number; // 周期内最大连续下跌天数
  currentConsecutiveUpDays: number; // 截至最新交易日的连续上涨天数
  currentConsecutiveDownDays: number; // 截至最新交易日的连续下跌天数

  // 涨跌幅度统计
  averageUpReturn: number | null; // 上涨交易日的平均涨幅
  averageDownReturn: number | null; // 下跌交易日的平均跌幅
  largestDailyGain: number | null; // 周期内最大单日涨幅
  largestDailyLoss: number | null; // 周期内最大单日跌幅
  gainLossRatio: number | null; // 平均上涨幅度 / 平均下跌幅度绝对值

  // 流动性统计
  averageAmount: number | null; // 周期平均成交额
  medianAmount: number | null; // 周期成交额中位数
  minAmount: number | null; // 周期最低成交额
  maxAmount: number | null; // 周期最高成交额
  amountStdDev: number | null; // 成交额标准差，反映成交额波动程度
  amountChange: number | null; // 最新成交额相对于周期平均成交额的变化比例
  activeDays: number; // 成交额大于零的交易日数量
  activeDayRatio: number | null; // 有效成交交易日占比
}

// ============================================================
// 4. 均线
// ============================================================

/** 多周期均线排列状态 */
export type MAAlignment =
  | "bullish" // 多头排列：MA5 > MA10 > MA20 > MA60
  | "bearish" // 空头排列：MA5 < MA10 < MA20 < MA60
  | "mixed" // 均线交错，没有形成明确排列
  | "unknown"; // 数据不足，无法判断

/** 均线交叉状态 */
export type MACross =
  | "golden" // 金叉：短期均线上穿长期均线
  | "death" // 死叉：短期均线下穿长期均线
  | "none" // 没有发生新的交叉
  | "unknown"; // 数据不足，无法判断

/** 单条均线的分析结果 */
export interface MAAnalysis {
  trend: Trend; // 均线自身的变化趋势：上升 / 下降 / 横盘 / 未知

  pricePosition:
    | "above" // 当前收盘价在均线上方
    | "below" // 当前收盘价在均线下方
    | "unknown"; // 无法判断
}

/** ETF 多周期均线指标及整体均线分析 */
export interface MovingAverages {
  ma5: Metric<Nullable<number>, MAAnalysis>; // 5 日均线及其趋势、价格位置
  ma10: Metric<Nullable<number>, MAAnalysis>; // 10 日均线及其趋势、价格位置
  ma20: Metric<Nullable<number>, MAAnalysis>; // 20 日均线及其趋势、价格位置
  ma60: Metric<Nullable<number>, MAAnalysis>; // 60 日均线及其趋势、价格位置
  ma120: Metric<Nullable<number>, MAAnalysis>; // 120 日均线及其趋势、价格位置
  ma250: Metric<Nullable<number>, MAAnalysis>; // 250 日均线及其趋势、价格位置

  analysis: {
    alignment: MAAlignment; // 多周期均线排列状态

    cross: {
      ma5Ma20: MACross; // MA5 与 MA20 的金叉 / 死叉状态
      ma10Ma60: MACross; // MA10 与 MA60 的金叉 / 死叉状态
    };

    dispersion: number | null; // 均线离散程度：(最高均线 - 最低均线) / 均线平均值
  };
}

// ============================================================
// 5. 均线偏离
// ============================================================

/** 当前价格相对于均线的偏离状态 */
export type DeviationStatus =
  | "deeply_below" // 深度低于均线，偏离率 < -10%
  | "below" // 低于均线，-10% 至 -5%
  | "near" // 接近均线，-5% 至 +5%
  | "above" // 高于均线，+5% 至 +10%
  | "deeply_above" // 深度高于均线，偏离率 > +10%
  | "unknown"; // 无法判断

/** 当前价格相对于各周期均线的偏离情况 */
export interface MADeviation {
  ma5: Metric<Nullable<number>, DeviationStatus>; // 当前价格相对于 MA5 的偏离比例及状态
  ma10: Metric<Nullable<number>, DeviationStatus>; // 当前价格相对于 MA10 的偏离比例及状态
  ma20: Metric<Nullable<number>, DeviationStatus>; // 当前价格相对于 MA20 的偏离比例及状态
  ma60: Metric<Nullable<number>, DeviationStatus>; // 当前价格相对于 MA60 的偏离比例及状态
  ma120: Metric<Nullable<number>, DeviationStatus>; // 当前价格相对于 MA120 的偏离比例及状态
  ma250: Metric<Nullable<number>, DeviationStatus>; // 当前价格相对于 MA250 的偏离比例及状态
}

// ============================================================
// 6. 布林带
// ============================================================

/** 布林带具体指标 */
export interface BollingerBands {
  upper: number; // 布林带上轨
  middle: number; // 布林带中轨，20 周期移动平均线
  lower: number; // 布林带下轨
  bandwidth: number; // 布林带宽度：(上轨 - 下轨) / 中轨
  percentB: number; // 当前价格在布林带中的相对位置
}

/** 当前价格在布林带中的位置 */
export type BollingerPosition =
  | "above_upper" // 价格高于布林带上轨
  | "upper_half" // 价格位于中轨与上轨之间
  | "lower_half" // 价格位于下轨与中轨之间
  | "below_lower" // 价格低于布林带下轨
  | "unknown"; // 无法判断

/** 布林带宽度变化趋势 */
export type BandwidthTrend =
  | "expanding" // 布林带扩张，波动区间扩大
  | "contracting" // 布林带收缩，波动区间缩小
  | "stable" // 布林带宽度基本稳定
  | "unknown"; // 无法判断

/** 布林带价格信号 */
export type BollingerSignal =
  | "breakout_upper" // 价格向上突破布林带上轨
  | "breakout_lower" // 价格向下跌破布林带下轨
  | "cross_above_middle" // 价格向上穿越布林带中轨
  | "cross_below_middle" // 价格向下穿越布林带中轨
  | "none" // 没有发生上述信号
  | "unknown"; // 数据不足，无法判断

/** 布林带整体形态分析 */
export interface BollingerAnalysis {
  position: BollingerPosition; // 当前价格在布林带中的位置

  bandwidthTrend: BandwidthTrend; // 布林带宽度的变化趋势

  squeeze: boolean | null; // 是否处于布林带挤压状态（近期带宽处于历史低位）

  priceSignal: BollingerSignal; // 当前交易日出现的布林带突破或穿越信号

  middleTrend: Trend; // 布林带中轨的变化趋势
}

/** 单个周期的完整布林带结果 */
export interface BollingerPeriod {
  value: BollingerBands; // 布林带具体指标数值
  analysis: BollingerAnalysis; // 布林带当前形态和信号分析
}

/** ETF 多周期布林带分析 */
export interface BollingerFeatures {
  daily: BollingerPeriod; // 日线布林带，基于日 K 收盘价计算
  weekly: BollingerPeriod; // 周线布林带，基于聚合后的周 K 收盘价计算
  monthly: BollingerPeriod; // 月线布林带，基于聚合后的月 K 收盘价计算
}

// ============================================================
// 7. 估值
// ============================================================

/** 估值历史统计范围 */
export type ValuationPeriod =
  | "1y" // 近一年
  | "3y" // 近三年
  | "5y" // 近五年
  | "all"; // 全部可用历史数据

/** 单个估值指标在指定历史周期内的统计信息 */
export interface ValuationHistory {
  min: number | null; // 历史最低估值
  max: number | null; // 历史最高估值
  mean: number | null; // 历史平均估值
  median: number | null; // 历史估值中位数
  stdDev: number | null; // 历史估值标准差

  percentile: number | null; // 当前估值在历史样本中的分位位置，例如 0.3 = 30% 分位
  deviation: number | null; // 当前估值相对于历史中位数的偏离比例
  zScore: number | null; // 当前估值相对于历史均值的标准分数
}

/** 单个估值指标的完整特征 */
export interface SingleValuationFeature {
  value: number | null; // 当前最新有效估值
  "1y": ValuationHistory;
  "3y": ValuationHistory;
  "5y": ValuationHistory;
  all: ValuationHistory;
  status: AnalysisStatus; // 当前估值历史位置：极低 / 偏低 / 中性 / 偏高 / 极高 / 未知

  peg: number | null; // 对应估值记录中的 PEG 数据
  date: number | null; // 当前估值数据对应日期，格式 YYYYMMDD
  delayDays: number | null; // 估值数据距离最新行情日期的自然日天数
}

/** ETF 各项估值指标 */
export interface ValuationFeatures {
  PE: SingleValuationFeature; // 市盈率及其历史估值分析
  PB: SingleValuationFeature; // 市净率及其历史估值分析
  PS: SingleValuationFeature; // 市销率及其历史估值分析
}

// ============================================================
// 8. 最终结果
// ============================================================

/**
 * ETF 基础信息 + 历史行情数据基本信息 + 最新行情信息
 *
 * Etf 的具体字段以项目 ../type 中的定义为准。
 */

/**
 * 单只 ETF 的完整日度特征分析结果
 *
 * 包含：
 * 4. 多周期收益、风险和流动性统计
 * 5. 多周期均线及趋势分析
 * 6. 当前价格相对于均线的偏离分析
 * 7. 日线、周线、月线布林带分析
 * 8. PE、PB、PS 估值及历史位置分析
 */
export interface EtfFeatures {
  performance: Record<PerformancePeriod, PeriodPerformance>; // 多周期表现：收益、风险、涨跌、流动性

  movingAverages: MovingAverages; // 多周期均线：均线数值、趋势、排列、金叉死叉
  maDeviation: MADeviation; // 均线偏离：当前价格相对于各周期均线的偏离程度
  bollinger: BollingerFeatures; // 布林带：日线、周线、月线形态及信号

  valuation: ValuationFeatures; // 估值：PE、PB、PS 当前值及历史估值位置
}

// ============================================================
// 1. 基础工具函数
// ============================================================

const TRADING_DAYS_PER_YEAR = 250;

const PERFORMANCE_PERIODS: PerformancePeriod[] = [
  "1w",
  "1m",
  "3m",
  "6m",
  "ytd",
  "1y",
  "3y",
  "5y",
  "all",
];

/** 判断数值是否为有效有限数字 */
function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 计算算术平均值 */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 计算中位数 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** 计算标准差，使用总体标准差 */
function standardDeviation(values: number[]): number | null {
  if (values.length === 0) return null;

  const average = mean(values)!;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length;

  return Math.sqrt(variance);
}

/** 将 YYYYMMDD 转换为 UTC 日期 */
function parseDate(date: number): Date {
  const year = Math.floor(date / 10000);
  const month = Math.floor((date % 10000) / 100);
  const day = date % 100;

  return new Date(Date.UTC(year, month - 1, day));
}

/** 计算两个 YYYYMMDD 日期之间的自然日差 */
function daysBetween(start: number, end: number): number {
  const milliseconds = parseDate(end).getTime() - parseDate(start).getTime();

  return Math.floor(milliseconds / 86400000);
}

/** 获取日期对应的年份 */
function getYear(date: number): number {
  return Math.floor(date / 10000);
}

/** 计算百分位位置 */
function calculatePercentile(
  values: number[],
  currentValue: number,
): number | null {
  if (values.length === 0) return null;

  const count = values.filter((value) => value <= currentValue).length;

  return count / values.length;
}

/** 根据百分位位置判断估值状态 */
function getAnalysisStatus(percentile: number | null): AnalysisStatus {
  if (percentile === null) return "unknown";
  if (percentile <= 0.1) return "very_low";
  if (percentile <= 0.3) return "low";
  if (percentile <= 0.7) return "neutral";
  if (percentile <= 0.9) return "high";
  return "very_high";
}

/** 根据数值序列判断趋势 */
function getTrend(values: number[]): Trend {
  if (values.length < 2) return "unknown";

  const first = values[0];
  const last = values[values.length - 1];

  if (!isValidNumber(first) || !isValidNumber(last)) {
    return "unknown";
  }

  const difference = last - first;
  const threshold = Math.abs(first) * 0.001;

  if (Math.abs(difference) <= threshold) return "flat";

  return difference > 0 ? "rising" : "falling";
}

/** 计算两个数值之间的相对变化 */
function calculateChange(current: number, previous: number): number | null {
  if (!isValidNumber(current) || !isValidNumber(previous)) return null;
  if (previous === 0) return null;

  return (current - previous) / Math.abs(previous);
}

/** 获取周期对应的交易日数量 */
function getPeriodTradingDays(period: PerformancePeriod): number | null {
  const periods: Record<Exclude<PerformancePeriod, "ytd" | "all">, number> = {
    "1w": 5,
    "1m": 21,
    "3m": 63,
    "6m": 126,
    "1y": 250,
    "3y": 750,
    "5y": 1250,
  };

  if (period === "ytd" || period === "all") return null;

  return periods[period];
}

// ============================================================
// 2. 行情数据处理
// ============================================================

/** 清洗并按日期升序排列 K 线 */
function normalizeKlines(klines: Kline[]): Kline[] {
  return klines
    .filter(
      (item) =>
        isValidNumber(item.date) && isValidNumber(item.close) && item.close > 0,
    )
    .sort((a, b) => a.date - b.date);
}

/** 计算日收益率序列 */
function calculateDailyReturns(klines: Kline[]): number[] {
  const returns: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const previousClose = klines[i - 1].close;
    const currentClose = klines[i].close;

    if (previousClose <= 0) continue;

    returns.push((currentClose - previousClose) / previousClose);
  }

  return returns;
}

/** 计算区间最大回撤 */
function calculateMaxDrawdown(klines: Kline[], baselineClose?: number): number {
  if (klines.length === 0) return 0;

  let peak = baselineClose ?? klines[0].close;
  let maxDrawdown = 0;

  for (const item of klines) {
    peak = Math.max(peak, item.close);

    if (peak > 0) {
      const drawdown = (item.close - peak) / peak;
      maxDrawdown = Math.min(maxDrawdown, drawdown);
    }
  }

  return Math.abs(maxDrawdown);
}

/** 获取周期内的 K 线数据，同时保留区间开始前一个交易日作为收益基准 */
function getPerformanceKlines(
  klines: Kline[],
  period: PerformancePeriod,
): Kline[] {
  if (klines.length === 0) return [];

  if (period === "all") return klines;

  if (period === "ytd") {
    const currentYear = getYear(klines[klines.length - 1].date);
    const firstIndex = klines.findIndex(
      (item) => getYear(item.date) === currentYear,
    );

    if (firstIndex === -1) return [];

    return klines.slice(Math.max(0, firstIndex - 1));
  }

  const tradingDays = getPeriodTradingDays(period)!;
  const startIndex = Math.max(0, klines.length - tradingDays - 1);

  return klines.slice(startIndex);
}

// ============================================================
// 3. 多周期表现计算
// ============================================================

function calculatePeriodPerformance(
  klines: Kline[],
  period: PerformancePeriod,
): PeriodPerformance {
  const emptyResult: PeriodPerformance = {
    totalReturn: 0,
    annualizedReturn: 0,
    dailyReturnMean: 0,
    dailyReturnMedian: 0,

    volatility: 0,
    volatilityAnalysis: "unknown",
    maxDrawdown: 0,
    maxDrawdownAnalysis: "unknown",

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

  const data = getPerformanceKlines(klines, period);

  if (data.length < 2) return emptyResult;

  const baseline = data[0];
  const periodKlines = data.slice(1);

  if (periodKlines.length === 0) return emptyResult;

  const returns = calculateDailyReturns(data);

  if (returns.length === 0) return emptyResult;

  // 收益统计
  const firstClose = baseline.close;
  const lastClose = data[data.length - 1].close;

  const totalReturn = firstClose > 0 ? lastClose / firstClose - 1 : 0;

  const elapsedTradingDays = returns.length;

  const annualizedReturn =
    totalReturn > -1 && elapsedTradingDays > 0
      ? Math.pow(1 + totalReturn, TRADING_DAYS_PER_YEAR / elapsedTradingDays) -
        1
      : -1;

  const dailyReturnMean = mean(returns) ?? 0;
  const dailyReturnMedian = median(returns) ?? 0;

  // 风险统计
  const dailyVolatility = standardDeviation(returns) ?? 0;
  const volatility = dailyVolatility * Math.sqrt(TRADING_DAYS_PER_YEAR);

  const volatilityAnalysis: PeriodPerformance["volatilityAnalysis"] =
    volatility < 0.15 ? "low" : volatility < 0.3 ? "medium" : "high";

  const maxDrawdown = calculateMaxDrawdown(periodKlines, firstClose);

  const maxDrawdownAnalysis: PeriodPerformance["maxDrawdownAnalysis"] =
    maxDrawdown < 0.1 ? "low" : maxDrawdown < 0.2 ? "medium" : "high";

  // 涨跌统计
  const upReturns = returns.filter((value) => value > 0);
  const downReturns = returns.filter((value) => value < 0);
  const flatReturns = returns.filter((value) => value === 0);

  const upDays = upReturns.length;
  const downDays = downReturns.length;
  const flatDays = flatReturns.length;

  const upDayRatio = returns.length > 0 ? upDays / returns.length : null;

  const downDayRatio = returns.length > 0 ? downDays / returns.length : null;

  // 连续涨跌统计
  let maxConsecutiveUpDays = 0;
  let maxConsecutiveDownDays = 0;
  let currentUp = 0;
  let currentDown = 0;

  for (const value of returns) {
    if (value > 0) {
      currentUp++;
      currentDown = 0;
    } else if (value < 0) {
      currentDown++;
      currentUp = 0;
    } else {
      currentUp = 0;
      currentDown = 0;
    }

    maxConsecutiveUpDays = Math.max(maxConsecutiveUpDays, currentUp);

    maxConsecutiveDownDays = Math.max(maxConsecutiveDownDays, currentDown);
  }

  // 截至最新交易日的连续涨跌天数
  let currentConsecutiveUpDays = 0;
  let currentConsecutiveDownDays = 0;

  for (let i = returns.length - 1; i >= 0; i--) {
    if (returns[i] > 0 && currentConsecutiveDownDays === 0) {
      currentConsecutiveUpDays++;
    } else if (returns[i] < 0 && currentConsecutiveUpDays === 0) {
      currentConsecutiveDownDays++;
    } else {
      break;
    }
  }

  // 涨跌幅度统计
  const averageUpReturn = mean(upReturns);
  const averageDownReturn = mean(downReturns);

  const largestDailyGain = upReturns.length > 0 ? Math.max(...upReturns) : null;

  const largestDailyLoss =
    downReturns.length > 0 ? Math.min(...downReturns) : null;

  const gainLossRatio =
    averageUpReturn !== null &&
    averageDownReturn !== null &&
    averageDownReturn !== 0
      ? averageUpReturn / Math.abs(averageDownReturn)
      : null;

  // 流动性统计
  const amounts = periodKlines
    .map((item) => item.amount)
    .filter((value) => isValidNumber(value) && value >= 0);

  const activeAmounts = amounts.filter((value) => value > 0);

  const averageAmount = mean(amounts);
  const medianAmount = median(amounts);

  const minAmount = amounts.length > 0 ? Math.min(...amounts) : null;

  const maxAmount = amounts.length > 0 ? Math.max(...amounts) : null;

  const amountStdDev = standardDeviation(amounts);

  const latestAmount = periodKlines[periodKlines.length - 1].amount;

  const amountChange =
    isValidNumber(latestAmount) && averageAmount !== null
      ? calculateChange(latestAmount, averageAmount)
      : null;

  const activeDays = activeAmounts.length;

  const activeDayRatio =
    amounts.length > 0 ? activeDays / amounts.length : null;

  return {
    totalReturn,
    annualizedReturn,
    dailyReturnMean,
    dailyReturnMedian,

    volatility,
    volatilityAnalysis,
    maxDrawdown,
    maxDrawdownAnalysis,

    upDays,
    downDays,
    flatDays,
    upDayRatio,
    downDayRatio,

    maxConsecutiveUpDays,
    maxConsecutiveDownDays,
    currentConsecutiveUpDays,
    currentConsecutiveDownDays,

    averageUpReturn,
    averageDownReturn,
    largestDailyGain,
    largestDailyLoss,
    gainLossRatio,

    averageAmount,
    medianAmount,
    minAmount,
    maxAmount,
    amountStdDev,
    amountChange,
    activeDays,
    activeDayRatio,
  };
}

function calculatePerformance(
  klines: Kline[],
): Record<PerformancePeriod, PeriodPerformance> {
  return Object.fromEntries(
    PERFORMANCE_PERIODS.map((period) => [
      period,
      calculatePeriodPerformance(klines, period),
    ]),
  ) as Record<PerformancePeriod, PeriodPerformance>;
}

// ============================================================
// 4. 均线计算
// ============================================================

/** 计算指定周期的移动平均线序列 */
function calculateMA(closes: number[], period: number): Array<number | null> {
  return closes.map((_, index) => {
    if (index + 1 < period) return null;

    const values = closes.slice(index - period + 1, index + 1);

    return mean(values);
  });
}

/** 获取最新有效均线 */
function getLatestMA(values: Array<number | null>): number | null {
  return values.length > 0 ? values[values.length - 1] : null;
}

/** 计算单条均线的趋势和价格位置 */
function calculateMAAnalysis(
  maValues: Array<number | null>,
  currentClose: number,
): MAAnalysis {
  const validValues = maValues.filter(
    (value): value is number => value !== null,
  );

  const trendValues = validValues.slice(-6);

  const trend = getTrend(trendValues);

  const latestMA = getLatestMA(maValues);

  let pricePosition: MAAnalysis["pricePosition"] = "unknown";

  if (latestMA !== null) {
    pricePosition =
      currentClose > latestMA
        ? "above"
        : currentClose < latestMA
          ? "below"
          : "unknown";
  }

  return {
    trend,
    pricePosition,
  };
}

/** 判断均线交叉 */
function calculateMACross(
  shortMA: Array<number | null>,
  longMA: Array<number | null>,
): MACross {
  if (shortMA.length < 2 || longMA.length < 2) {
    return "unknown";
  }

  const previousShort = shortMA[shortMA.length - 2];
  const currentShort = shortMA[shortMA.length - 1];

  const previousLong = longMA[longMA.length - 2];
  const currentLong = longMA[longMA.length - 1];

  if (
    previousShort === null ||
    currentShort === null ||
    previousLong === null ||
    currentLong === null
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

/** 计算均线排列 */
function calculateMAAlignment(values: Array<number | null>): MAAlignment {
  if (values.some((value) => value === null)) {
    return "unknown";
  }

  const numbers = values as number[];

  const bullish = numbers.every(
    (value, index) => index === 0 || numbers[index - 1] > value,
  );

  const bearish = numbers.every(
    (value, index) => index === 0 || numbers[index - 1] < value,
  );

  if (bullish) return "bullish";
  if (bearish) return "bearish";

  return "mixed";
}

function calculateMovingAverages(klines: Kline[]): MovingAverages {
  const closes = klines.map((item) => item.close);
  const currentClose = closes[closes.length - 1] ?? 0;

  const maSeries = {
    ma5: calculateMA(closes, 5),
    ma10: calculateMA(closes, 10),
    ma20: calculateMA(closes, 20),
    ma60: calculateMA(closes, 60),
    ma120: calculateMA(closes, 120),
    ma250: calculateMA(closes, 250),
  };

  const ma5 = getLatestMA(maSeries.ma5);
  const ma10 = getLatestMA(maSeries.ma10);
  const ma20 = getLatestMA(maSeries.ma20);
  const ma60 = getLatestMA(maSeries.ma60);
  const ma120 = getLatestMA(maSeries.ma120);
  const ma250 = getLatestMA(maSeries.ma250);

  const availableMAs = [ma5, ma10, ma20, ma60, ma120, ma250].filter(
    (value): value is number => value !== null,
  );

  const dispersion =
    availableMAs.length >= 2
      ? (() => {
          const average = mean(availableMAs)!;

          return average !== 0
            ? (Math.max(...availableMAs) - Math.min(...availableMAs)) / average
            : null;
        })()
      : null;

  return {
    ma5: {
      value: ma5,
      analysis: calculateMAAnalysis(maSeries.ma5, currentClose),
    },
    ma10: {
      value: ma10,
      analysis: calculateMAAnalysis(maSeries.ma10, currentClose),
    },
    ma20: {
      value: ma20,
      analysis: calculateMAAnalysis(maSeries.ma20, currentClose),
    },
    ma60: {
      value: ma60,
      analysis: calculateMAAnalysis(maSeries.ma60, currentClose),
    },
    ma120: {
      value: ma120,
      analysis: calculateMAAnalysis(maSeries.ma120, currentClose),
    },
    ma250: {
      value: ma250,
      analysis: calculateMAAnalysis(maSeries.ma250, currentClose),
    },

    analysis: {
      alignment: calculateMAAlignment([ma5, ma10, ma20, ma60]),
      cross: {
        ma5Ma20: calculateMACross(maSeries.ma5, maSeries.ma20),
        ma10Ma60: calculateMACross(maSeries.ma10, maSeries.ma60),
      },
      dispersion,
    },
  };
}

// ============================================================
// 5. 均线偏离计算
// ============================================================

function getDeviationStatus(deviation: number | null): DeviationStatus {
  if (deviation === null) return "unknown";

  if (deviation < -0.1) return "deeply_below";
  if (deviation < -0.05) return "below";
  if (deviation <= 0.05) return "near";
  if (deviation <= 0.1) return "above";

  return "deeply_above";
}

function calculateMADeviation(
  close: number,
  movingAverages: MovingAverages,
): MADeviation {
  const calculate = (
    ma: Metric<Nullable<number>, MAAnalysis>,
  ): Metric<Nullable<number>, DeviationStatus> => {
    const deviation =
      ma.value !== null && ma.value !== 0
        ? (close - ma.value) / ma.value
        : null;

    return {
      value: deviation,
      analysis: getDeviationStatus(deviation),
    };
  };

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
// 6. K 线周期聚合
// ============================================================

/** 获取 ISO 周的年份和周数 */
function getISOWeek(date: number): string {
  const value = parseDate(date);

  const day = value.getUTCDay() || 7;

  value.setUTCDate(value.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));

  const week = Math.ceil(
    ((value.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );

  return `${value.getUTCFullYear()}-${week}`;
}

/** 将日 K 聚合为周 K */
function aggregateWeeklyKlines(klines: Kline[]): Kline[] {
  const groups = new Map<string, Kline[]>();

  for (const item of klines) {
    const key = getISOWeek(item.date);
    const group = groups.get(key) ?? [];

    group.push(item);
    groups.set(key, group);
  }

  return [...groups.values()].map((items) => {
    const first = items[0];
    const last = items[items.length - 1];

    return {
      ...last,
      open: first.open,
      high: Math.max(...items.map((item) => item.high)),
      low: Math.min(...items.map((item) => item.low)),
      close: last.close,
      volume: items.reduce((sum, item) => sum + item.volume, 0),
      amount: items.reduce((sum, item) => sum + item.amount, 0),
    };
  });
}

/** 将日 K 聚合为月 K */
function aggregateMonthlyKlines(klines: Kline[]): Kline[] {
  const groups = new Map<string, Kline[]>();

  for (const item of klines) {
    const key = String(Math.floor(item.date / 100));
    const group = groups.get(key) ?? [];

    group.push(item);
    groups.set(key, group);
  }

  return [...groups.values()].map((items) => {
    const first = items[0];
    const last = items[items.length - 1];

    return {
      ...last,
      open: first.open,
      high: Math.max(...items.map((item) => item.high)),
      low: Math.min(...items.map((item) => item.low)),
      close: last.close,
      volume: items.reduce((sum, item) => sum + item.volume, 0),
      amount: items.reduce((sum, item) => sum + item.amount, 0),
    };
  });
}

// ============================================================
// 7. 布林带计算
// ============================================================

/** 计算每个交易日的布林带宽度 */
function calculateBandwidthSeries(
  closes: number[],
  period = 20,
  multiplier = 2,
): Array<number | null> {
  return closes.map((_, index) => {
    if (index + 1 < period) return null;

    const values = closes.slice(index - period + 1, index + 1);
    const middle = mean(values);
    const deviation = standardDeviation(values);

    if (middle === null || deviation === null || middle === 0) {
      return null;
    }

    return (2 * multiplier * deviation) / middle;
  });
}

/** 判断布林带宽度趋势 */
function calculateBandwidthTrend(values: Array<number | null>): BandwidthTrend {
  const validValues = values.filter((value): value is number => value !== null);

  if (validValues.length < 6) return "unknown";

  const recent = validValues.slice(-5);
  const trend = getTrend(recent);

  if (trend === "rising") return "expanding";
  if (trend === "falling") return "contracting";

  return "stable";
}

/** 判断是否处于布林带挤压 */
function calculateSqueeze(values: Array<number | null>): boolean | null {
  const validValues = values.filter((value): value is number => value !== null);

  if (validValues.length < 20) return null;

  const history = validValues.slice(-120);
  const current = history[history.length - 1];

  const percentile = calculatePercentile(history, current);

  return percentile !== null && percentile <= 0.2;
}

/** 计算布林带价格信号 */
function calculateBollingerSignal(
  closes: number[],
  upperSeries: Array<number | null>,
  middleSeries: Array<number | null>,
  lowerSeries: Array<number | null>,
): BollingerSignal {
  if (closes.length < 2) return "unknown";

  const index = closes.length - 1;

  const currentClose = closes[index];
  const previousClose = closes[index - 1];

  const currentUpper = upperSeries[index];
  const previousUpper = upperSeries[index - 1];

  const currentMiddle = middleSeries[index];
  const previousMiddle = middleSeries[index - 1];

  const currentLower = lowerSeries[index];
  const previousLower = lowerSeries[index - 1];

  if (
    currentUpper === null ||
    previousUpper === null ||
    currentMiddle === null ||
    previousMiddle === null ||
    currentLower === null ||
    previousLower === null
  ) {
    return "unknown";
  }

  if (previousClose <= previousUpper && currentClose > currentUpper) {
    return "breakout_upper";
  }

  if (previousClose >= previousLower && currentClose < currentLower) {
    return "breakout_lower";
  }

  if (previousClose <= previousMiddle && currentClose > currentMiddle) {
    return "cross_above_middle";
  }

  if (previousClose >= previousMiddle && currentClose < currentMiddle) {
    return "cross_below_middle";
  }

  return "none";
}

/** 计算一个周期的布林带 */
function calculateBollingerPeriod(klines: Kline[]): BollingerPeriod {
  const closes = klines.map((item) => item.close);
  const period = 20;
  const multiplier = 2;

  const middleSeries = calculateMA(closes, period);

  const upperSeries: Array<number | null> = [];
  const lowerSeries: Array<number | null> = [];

  for (let i = 0; i < closes.length; i++) {
    if (i + 1 < period) {
      upperSeries.push(null);
      lowerSeries.push(null);
      continue;
    }

    const values = closes.slice(i - period + 1, i + 1);
    const middle = mean(values)!;
    const deviation = standardDeviation(values)!;

    upperSeries.push(middle + multiplier * deviation);
    lowerSeries.push(middle - multiplier * deviation);
  }

  const bandwidthSeries = calculateBandwidthSeries(closes, period, multiplier);

  const index = closes.length - 1;

  const upper = upperSeries[index];
  const middle = middleSeries[index];
  const lower = lowerSeries[index];
  const close = closes[index];

  if (upper === null || middle === null || lower === null || middle === 0) {
    return {
      value: {
        upper: 0,
        middle: 0,
        lower: 0,
        bandwidth: 0,
        percentB: 0,
      },
      analysis: {
        position: "unknown",
        bandwidthTrend: "unknown",
        squeeze: null,
        priceSignal: "unknown",
        middleTrend: "unknown",
      },
    };
  }

  const bandwidth = (upper - lower) / middle;
  const percentB = (close - lower) / (upper - lower);

  let position: BollingerPosition = "unknown";

  if (close > upper) {
    position = "above_upper";
  } else if (close < lower) {
    position = "below_lower";
  } else if (close >= middle) {
    position = "upper_half";
  } else {
    position = "lower_half";
  }

  return {
    value: {
      upper,
      middle,
      lower,
      bandwidth,
      percentB,
    },
    analysis: {
      position,
      bandwidthTrend: calculateBandwidthTrend(bandwidthSeries),
      squeeze: calculateSqueeze(bandwidthSeries),
      priceSignal: calculateBollingerSignal(
        closes,
        upperSeries,
        middleSeries,
        lowerSeries,
      ),
      middleTrend: getTrend(
        middleSeries
          .filter((value): value is number => value !== null)
          .slice(-6),
      ),
    },
  };
}

function calculateBollinger(klines: Kline[]): BollingerFeatures {
  const weeklyKlines = aggregateWeeklyKlines(klines);
  const monthlyKlines = aggregateMonthlyKlines(klines);

  return {
    daily: calculateBollingerPeriod(klines),
    weekly: calculateBollingerPeriod(weeklyKlines),
    monthly: calculateBollingerPeriod(monthlyKlines),
  };
}

// ============================================================
// 8. 估值计算
// ============================================================

/** 计算单个估值周期的历史统计 */
function calculateValuationHistory(
  history: Valuation[],
  currentValue: number | null,
): ValuationHistory {
  const empty: ValuationHistory = {
    min: null,
    max: null,
    mean: null,
    median: null,
    stdDev: null,
    percentile: null,
    deviation: null,
    zScore: null,
  };

  if (currentValue === null || history.length === 0) {
    return empty;
  }

  const values = history
    .map((item) => item.value)
    .filter((value) => isValidNumber(value));

  if (values.length === 0) return empty;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = mean(values)!;
  const middle = median(values)!;
  const stdDev = standardDeviation(values)!;

  const percentile = calculatePercentile(values, currentValue);

  const deviation =
    middle !== 0 ? (currentValue - middle) / Math.abs(middle) : null;

  const zScore = stdDev !== 0 ? (currentValue - average) / stdDev : null;

  return {
    min,
    max,
    mean: average,
    median: middle,
    stdDev,
    percentile,
    deviation,
    zScore,
  };
}

/** 获取指定估值周期的历史数据 */
function getValuationHistory(
  valuations: Valuation[],
  period: ValuationPeriod,
  latestDate: number,
): Valuation[] {
  if (period === "all") {
    return valuations.filter((item) => item.date <= latestDate);
  }

  const years: Record<Exclude<ValuationPeriod, "all">, number> = {
    "1y": 1,
    "3y": 3,
    "5y": 5,
  };

  const startDate = latestDate - years[period] * 10000;

  return valuations.filter(
    (item) => item.date >= startDate && item.date <= latestDate,
  );
}

/** 计算 PE / PB / PS 单项估值特征 */
function calculateSingleValuationFeature(
  valuations: Valuation[],
  type: "PE" | "PB" | "PS",
  latestDate: number,
): SingleValuationFeature {
  const history = valuations
    .filter(
      (item) =>
        item.type.toUpperCase() === type &&
        item.date <= latestDate &&
        isValidNumber(item.value),
    )
    .sort((a, b) => a.date - b.date);

  const latest = history[history.length - 1] ?? null;
  const currentValue = latest?.value ?? null;

  const analysis: Record<ValuationPeriod, ValuationHistory> = {
    "1y": calculateValuationHistory(
      getValuationHistory(history, "1y", latestDate),
      currentValue,
    ),
    "3y": calculateValuationHistory(
      getValuationHistory(history, "3y", latestDate),
      currentValue,
    ),
    "5y": calculateValuationHistory(
      getValuationHistory(history, "5y", latestDate),
      currentValue,
    ),
    all: calculateValuationHistory(
      getValuationHistory(history, "all", latestDate),
      currentValue,
    ),
  };

  const status = getAnalysisStatus(analysis["5y"].percentile);

  return {
    value: currentValue,
    ...analysis,
    status,
    peg: latest?.peg ?? null,
    date: latest?.date ?? null,
    delayDays: latest !== null ? daysBetween(latest.date, latestDate) : null,
  };
}

function calculateValuation(
  valuations: Valuation[],
  latestDate: number,
): ValuationFeatures {
  return {
    PE: calculateSingleValuationFeature(valuations, "PE", latestDate),
    PB: calculateSingleValuationFeature(valuations, "PB", latestDate),
    PS: calculateSingleValuationFeature(valuations, "PS", latestDate),
  };
}

// ============================================================
// 9. 最终计算入口
// ============================================================

export function calculateEtfFeatures(
  klines: Kline[],
  valuations: {
    PE: Valuation[];
    PB: Valuation[];
    PS: Valuation[];
  },
): EtfFeatures {
  const normalizedKlines = normalizeKlines(klines);

  if (normalizedKlines.length === 0) {
    throw new Error("calculateEtfFeatures: klines 不能为空");
  }

  const latestKline = normalizedKlines[normalizedKlines.length - 1];

  const latestDate = latestKline.date;
  const latestClose = latestKline.close;

  const movingAverages = calculateMovingAverages(normalizedKlines);

  // 三类估值数据合并后，根据 type 区分 PE / PB / PS
  const allValuations = [...valuations.PE, ...valuations.PB, ...valuations.PS];

  return {
    performance: calculatePerformance(normalizedKlines),

    movingAverages,

    maDeviation: calculateMADeviation(latestClose, movingAverages),

    bollinger: calculateBollinger(normalizedKlines),

    valuation: calculateValuation(allValuations, latestDate),
  };
}
