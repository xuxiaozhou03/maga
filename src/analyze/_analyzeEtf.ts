/**
 * etfAnalysis.ts
 *
 * ETF 日K行情与估值分析
 *
 * 输入：
 *   klines: Kline[]
 *   valuations: PE / PB / PS
 *
 * 输出：
 *   EtfAnalysis
 *
 * 分析内容：
 *   1. 最新行情
 *   2. 多周期表现
 *   3. 估值分析
 *   4. 均线趋势
 *   5. 价格位置
 *   6. 波动特征
 *   7. 成交特征
 *
 * 计算约定：
 *   - 收益率、波动率等比例使用小数，例如 0.1 = 10%
 *   - 估值百分位、价格百分位使用 0～100
 *   - 年化交易日按 252 天计算
 *   - K线按日期升序排列
 *   - 无法计算的数据返回 null
 *   - 不修改输入数据
 */

import { Kline } from "../crawler/fetchKline";

// ============================================================
// 1. 基础类型
// ============================================================

type PerformancePeriod =
  | "1w"
  | "1m"
  | "3m"
  | "6m"
  | "ytd"
  | "1y"
  | "3y"
  | "5y"
  | "all";

type RiskLevel = "low" | "medium" | "high" | "unknown";

type ValuationLevel = "low" | "medium" | "high" | "unknown";

interface Valuation {
  code: string;
  type: "PE" | "PB" | "PS";
  date: number;
  value: number;
  percent: number;
  peg?: number | null;
}

interface AnalyzeEtfInput {
  klines: Kline[];

  valuations: {
    PE: Valuation[];
    PB: Valuation[];
    PS: Valuation[];
  };
}

// ============================================================
// 2. 最新行情
// ============================================================

interface MarketAnalysis {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;

  volume: number | null;
  amount: number | null;

  change: number | null;
  changePercent: number | null;
}

// ============================================================
// 3. 多周期表现
// ============================================================

interface PerformanceReturns {
  /** 周期累计收益率 */
  totalReturn: number | null;

  /** 周期年化收益率 */
  annualizedReturn: number | null;

  /** 日收益率算术平均值 */
  dailyReturnMean: number | null;

  /** 日收益率中位数 */
  dailyReturnMedian: number | null;

  /** 20个交易日滚动收益率最大值 */
  bestRollingReturn: number | null;

  /** 20个交易日滚动收益率最小值 */
  worstRollingReturn: number | null;
}

interface PerformanceRisk {
  /** 年化波动率 */
  volatility: number | null;

  volatilityAnalysis: RiskLevel;

  /** 最大回撤，负数 */
  maxDrawdown: number | null;

  maxDrawdownAnalysis: RiskLevel;

  /** 年化下行波动率 */
  downsideVolatility: number | null;

  /** 夏普比率 */
  sharpeRatio: number | null;

  /** 索提诺比率 */
  sortinoRatio: number | null;

  /** 卡玛比率 */
  calmarRatio: number | null;
}

interface PerformanceDailyChanges {
  upDays: number;
  downDays: number;
  flatDays: number;

  upDayRatio: number | null;
  downDayRatio: number | null;

  /** 上涨天数 / 下跌天数 */
  upDownDayRatio: number | null;

  /** 上涨交易日平均涨幅 */
  averageUpReturn: number | null;

  /** 下跌交易日平均跌幅 */
  averageDownReturn: number | null;

  largestDailyGain: number | null;
  largestDailyLoss: number | null;

  /** 平均上涨幅度 / 平均下跌幅度绝对值 */
  gainLossRatio: number | null;

  /** 平均日内振幅 */
  averageDailyRange: number | null;
}

interface PerformanceStreaks {
  maxConsecutiveUpDays: number;
  maxConsecutiveDownDays: number;

  currentConsecutiveUpDays: number;
  currentConsecutiveDownDays: number;

  /** 最大连续上涨区间的累计收益 */
  maxConsecutiveUpReturn: number | null;

  /** 最大连续下跌区间的累计收益 */
  maxConsecutiveDownReturn: number | null;
}

interface PerformanceTrading {
  averageAmount: number | null;
  medianAmount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  amountStdDev: number | null;

  latestAmount: number | null;

  /** 最新成交额 / 周期平均成交额 */
  amountRatio: number | null;

  /** 最新成交额在周期历史中的百分位 */
  amountPercentile: number | null;

  averageVolume: number | null;
  latestVolume: number | null;

  activeDays: number;
  activeDayRatio: number | null;
}

interface PeriodPerformance {
  returns: PerformanceReturns;
  risk: PerformanceRisk;
  dailyChanges: PerformanceDailyChanges;
  streaks: PerformanceStreaks;
  trading: PerformanceTrading;
}

// ============================================================
// 4. 估值分析
// ============================================================

interface ValuationHistorical {
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
}

interface ValuationChange {
  change1m: number | null;
  change3m: number | null;
  change6m: number | null;
  change1y: number | null;
}

interface ValuationAnalysis {
  value: number | null;

  /** 历史估值百分位，0～100 */
  percent: number | null;

  level: ValuationLevel;

  historical: ValuationHistorical;

  change: ValuationChange;
}

interface EtfValuationAnalysis {
  PE: ValuationAnalysis | null;
  PB: ValuationAnalysis | null;
  PS: ValuationAnalysis | null;
}

// ============================================================
// 5. 趋势分析
// ============================================================

type MovingAveragePeriod = "ma5" | "ma10" | "ma20" | "ma60" | "ma120" | "ma250";

type TrendDirection = "bullish" | "bearish" | "sideways" | "unknown";

type MovingAverageAlignment = "bullish" | "bearish" | "mixed" | "unknown";

interface TrendAnalysis {
  movingAverages: Record<MovingAveragePeriod, number | null>;

  /** 当前价格相对均线的偏离比例 */
  maDeviation: Record<MovingAveragePeriod, number | null>;

  alignment: MovingAverageAlignment;

  direction: TrendDirection;

  /** 趋势强度，0～100 */
  strength: number | null;
}

// ============================================================
// 6. 价格位置
// ============================================================

interface PricePositionAnalysis {
  historical: {
    highestPrice: number | null;
    lowestPrice: number | null;

    /** 当前价格距离历史最高价的比例 */
    distanceFromHigh: number | null;

    /** 当前价格距离历史最低价的比例 */
    distanceFromLow: number | null;
  };

  /** 当前价格在历史价格中的百分位，0～100 */
  percentile: {
    day20: number | null;
    day60: number | null;
    day120: number | null;
    day250: number | null;
    all: number | null;
  };

  /** 滚动区间最高价和最低价 */
  periods: {
    high20: number | null;
    low20: number | null;

    high60: number | null;
    low60: number | null;

    high120: number | null;
    low120: number | null;
  };
}

// ============================================================
// 7. 波动特征
// ============================================================

interface AtrAnalysis {
  atr14: number | null;

  /** ATR / 最新收盘价 */
  atrPercent: number | null;
}

interface BollingerAnalysis {
  upper: number | null;
  middle: number | null;
  lower: number | null;

  /** 布林带宽度 */
  bandwidth: number | null;

  /** 价格在布林带中的位置 */
  position: number | null;
}

interface VolatilityAnalysis {
  atr: AtrAnalysis;

  bollinger: BollingerAnalysis;

  /** 历史年化波动率 */
  historicalVolatility: {
    day20: number | null;
    day60: number | null;
    day120: number | null;
  };
}

// ============================================================
// 8. 成交特征
// ============================================================

interface AmountActivityAnalysis {
  latest: number | null;

  average5: number | null;
  average20: number | null;
  average60: number | null;

  /** 最新成交额 / 近期平均成交额 */
  ratio5: number | null;
  ratio20: number | null;

  /** 最新成交额历史百分位 */
  percentile: number | null;
}

interface VolumeActivityAnalysis {
  latest: number | null;

  average5: number | null;
  average20: number | null;
  average60: number | null;

  ratio20: number | null;
}

type PriceVolumeStatus =
  | "volume_price_rise"
  | "volume_price_fall"
  | "price_rise_volume_fall"
  | "price_fall_volume_rise"
  | "neutral"
  | "unknown";

interface TradingActivityAnalysis {
  amount: AmountActivityAnalysis;
  volume: VolumeActivityAnalysis;

  priceVolume: {
    status: PriceVolumeStatus;
  };
}

// ============================================================
// 9. 最终输出
// ============================================================

interface EtfAnalysis {
  code: string;

  latestDate: number;

  startDate: number;
  tradingDays: number;

  market: MarketAnalysis;

  performance: Record<PerformancePeriod, PeriodPerformance | null>;

  valuation: EtfValuationAnalysis;

  trend: TrendAnalysis;

  pricePosition: PricePositionAnalysis;

  volatility: VolatilityAnalysis;

  tradingActivity: TradingActivityAnalysis;
}

// ============================================================
// 10. 常量
// ============================================================

const TRADING_DAYS_PER_YEAR = 252;

const PERIODS: PerformancePeriod[] = [
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

const MA_PERIODS: MovingAveragePeriod[] = [
  "ma5",
  "ma10",
  "ma20",
  "ma60",
  "ma120",
  "ma250",
];

// ============================================================
// 11. 通用统计函数
// ============================================================

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function min(values: number[]): number | null {
  return values.length ? Math.min(...values) : null;
}

function max(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;

  const avg = mean(values)!;

  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }

  const result = numerator / denominator;

  return Number.isFinite(result) ? result : null;
}

function percentileRank(values: number[], current: number): number | null {
  if (!values.length) return null;

  const count = values.filter((value) => value <= current).length;

  return (count / values.length) * 100;
}

// ============================================================
// 12. 日期函数
// ============================================================

function dateToTimestamp(date: number): number {
  const text = String(date);

  if (!/^\d{8}$/.test(text)) return NaN;

  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));

  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return NaN;
  }

  return timestamp;
}

function timestampToDate(timestamp: number): number {
  const date = new Date(timestamp);

  return (
    date.getUTCFullYear() * 10000 +
    (date.getUTCMonth() + 1) * 100 +
    date.getUTCDate()
  );
}

function subtractMonths(date: number, months: number): number {
  const timestamp = dateToTimestamp(date);
  const source = new Date(timestamp);

  const day = source.getUTCDate();

  source.setUTCDate(1);
  source.setUTCMonth(source.getUTCMonth() - months);

  const lastDay = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0),
  ).getUTCDate();

  source.setUTCDate(Math.min(day, lastDay));

  return timestampToDate(source.getTime());
}

function subtractYears(date: number, years: number): number {
  const timestamp = dateToTimestamp(date);
  const source = new Date(timestamp);

  const month = source.getUTCMonth();
  const day = source.getUTCDate();

  source.setUTCDate(1);
  source.setUTCFullYear(source.getUTCFullYear() - years);

  const lastDay = new Date(
    Date.UTC(source.getUTCFullYear(), month + 1, 0),
  ).getUTCDate();

  source.setUTCMonth(month);
  source.setUTCDate(Math.min(day, lastDay));

  return timestampToDate(source.getTime());
}

// ============================================================
// 13. 数据预处理
// ============================================================

function normalizeKlines(klines: Kline[]): Kline[] {
  const map = new Map<number, Kline>();

  for (const item of klines) {
    if (
      !Number.isInteger(item.date) ||
      !Number.isFinite(dateToTimestamp(item.date)) ||
      !isValidNumber(item.open) ||
      !isValidNumber(item.high) ||
      !isValidNumber(item.low) ||
      !isValidNumber(item.close) ||
      !isValidNumber(item.volume) ||
      !isValidNumber(item.amount)
    ) {
      continue;
    }

    if (
      item.open <= 0 ||
      item.high <= 0 ||
      item.low <= 0 ||
      item.close <= 0 ||
      item.high < Math.max(item.open, item.close) ||
      item.low > Math.min(item.open, item.close) ||
      item.high < item.low ||
      item.volume < 0 ||
      item.amount < 0
    ) {
      continue;
    }

    map.set(item.date, item);
  }

  return [...map.values()].sort((a, b) => a.date - b.date);
}

function normalizeValuations(
  values: Valuation[],
  type: "PE" | "PB" | "PS",
): Valuation[] {
  const map = new Map<number, Valuation>();

  for (const item of values) {
    if (
      item.type !== type ||
      !Number.isFinite(dateToTimestamp(item.date)) ||
      !isValidNumber(item.value) ||
      !isValidNumber(item.percent)
    ) {
      continue;
    }

    map.set(item.date, item);
  }

  return [...map.values()].sort((a, b) => a.date - b.date);
}

// ============================================================
// 14. K线收益率
// ============================================================

function getDailyReturns(klines: Kline[]): number[] {
  const returns: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const previous = klines[i - 1].close;
    const current = klines[i].close;

    returns.push(current / previous - 1);
  }

  return returns;
}

function calculateTotalReturn(klines: Kline[]): number | null {
  if (klines.length < 2) return null;

  return klines[klines.length - 1].close / klines[0].close - 1;
}

function calculateAnnualizedReturn(
  totalReturn: number | null,
  tradingDays: number,
): number | null {
  if (totalReturn === null || totalReturn <= -1 || tradingDays <= 0) {
    return null;
  }

  return Math.pow(1 + totalReturn, TRADING_DAYS_PER_YEAR / tradingDays) - 1;
}

// ============================================================
// 15. 风险指标
// ============================================================

function calculateVolatility(returns: number[]): number | null {
  const std = standardDeviation(returns);

  if (std === null) return null;

  return std * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

function calculateDownsideVolatility(returns: number[]): number | null {
  if (returns.length < 2) return null;

  const downsideVariance = mean(
    returns.map((r) => Math.pow(Math.min(r, 0), 2)),
  );

  if (downsideVariance === null) return null;

  return Math.sqrt(downsideVariance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

function calculateMaxDrawdown(klines: Kline[]): number | null {
  if (klines.length < 2) return null;

  let peak = klines[0].close;
  let maxDrawdown = 0;

  for (const item of klines) {
    peak = Math.max(peak, item.close);

    const drawdown = item.close / peak - 1;

    maxDrawdown = Math.min(maxDrawdown, drawdown);
  }

  return maxDrawdown;
}

function calculateSharpeRatio(
  returns: number[],
  riskFreeRate = 0,
): number | null {
  if (returns.length < 2) return null;

  const dailyRiskFreeRate =
    Math.pow(1 + riskFreeRate, 1 / TRADING_DAYS_PER_YEAR) - 1;

  const excessReturns = returns.map((r) => r - dailyRiskFreeRate);

  const avg = mean(excessReturns);
  const std = standardDeviation(excessReturns);

  if (avg === null || std === null || std === 0) {
    return null;
  }

  return (avg / std) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

function calculateSortinoRatio(
  returns: number[],
  riskFreeRate = 0,
): number | null {
  if (returns.length < 2) return null;

  const dailyRiskFreeRate =
    Math.pow(1 + riskFreeRate, 1 / TRADING_DAYS_PER_YEAR) - 1;

  const excessReturns = returns.map((r) => r - dailyRiskFreeRate);

  const avg = mean(excessReturns);

  if (avg === null) return null;

  const downsideVariance = mean(
    excessReturns.map((r) => Math.pow(Math.min(r, 0), 2)),
  );

  if (downsideVariance === null || downsideVariance === 0) {
    return null;
  }

  return (avg / Math.sqrt(downsideVariance)) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

function calculateCalmarRatio(
  annualizedReturn: number | null,
  maxDrawdown: number | null,
): number | null {
  if (annualizedReturn === null || maxDrawdown === null || maxDrawdown === 0) {
    return null;
  }

  return annualizedReturn / Math.abs(maxDrawdown);
}

function getRiskLevel(
  value: number | null,
  low: number,
  high: number,
): RiskLevel {
  if (value === null) return "unknown";

  if (value <= low) return "low";
  if (value <= high) return "medium";

  return "high";
}

// ============================================================
// 16. 滚动收益
// ============================================================

function calculateRollingReturns(klines: Kline[], window: number): number[] {
  const result: number[] = [];

  if (klines.length <= window) return result;

  for (let i = window; i < klines.length; i++) {
    result.push(klines[i].close / klines[i - window].close - 1);
  }

  return result;
}

// ============================================================
// 17. 连续涨跌统计
// ============================================================

function calculateStreaks(returns: number[]) {
  let currentUp = 0;
  let currentDown = 0;

  let maxUp = 0;
  let maxDown = 0;

  let maxUpReturn: number | null = null;
  let maxDownReturn: number | null = null;

  let upProduct = 1;
  let downProduct = 1;

  for (const r of returns) {
    if (r > 0) {
      currentUp++;
      currentDown = 0;

      upProduct *= 1 + r;
      downProduct = 1;

      if (currentUp > maxUp) {
        maxUp = currentUp;
      }

      const currentReturn = upProduct - 1;

      maxUpReturn = Math.max(maxUpReturn ?? -Infinity, currentReturn);
    } else if (r < 0) {
      currentDown++;
      currentUp = 0;

      downProduct *= 1 + r;
      upProduct = 1;

      if (currentDown > maxDown) {
        maxDown = currentDown;
      }

      const currentReturn = downProduct - 1;

      maxDownReturn = Math.min(maxDownReturn ?? Infinity, currentReturn);
    } else {
      currentUp = 0;
      currentDown = 0;
      upProduct = 1;
      downProduct = 1;
    }
  }

  return {
    maxUp,
    maxDown,
    currentUp,
    currentDown,
    maxUpReturn,
    maxDownReturn,
  };
}

// ============================================================
// 18. 多周期数据截取
// ============================================================

function getPeriodKlines(klines: Kline[], period: PerformancePeriod): Kline[] {
  if (!klines.length) return [];

  if (period === "all") return klines;

  const latestDate = klines[klines.length - 1].date;

  let startDate: number;

  if (period === "1w") {
    // 5个收益区间，需要6根K线
    return klines.slice(-6);
  }

  if (period === "1m") {
    startDate = subtractMonths(latestDate, 1);
  } else if (period === "3m") {
    startDate = subtractMonths(latestDate, 3);
  } else if (period === "6m") {
    startDate = subtractMonths(latestDate, 6);
  } else if (period === "ytd") {
    startDate = Math.floor(latestDate / 10000) * 10000 + 101;
  } else if (period === "1y") {
    startDate = subtractYears(latestDate, 1);
  } else if (period === "3y") {
    startDate = subtractYears(latestDate, 3);
  } else {
    startDate = subtractYears(latestDate, 5);
  }

  const index = klines.findIndex((item) => item.date >= startDate);

  if (index === -1) return [];

  // 加入周期起点之前的一个交易日作为收益基准
  return klines.slice(Math.max(0, index - 1));
}

// ============================================================
// 19. 单周期表现计算
// ============================================================

function calculatePeriodPerformance(klines: Kline[]): PeriodPerformance | null {
  if (klines.length < 2) return null;

  const returns = getDailyReturns(klines);

  if (!returns.length) return null;

  const totalReturn = calculateTotalReturn(klines);

  const annualizedReturn = calculateAnnualizedReturn(
    totalReturn,
    returns.length,
  );

  const volatility = calculateVolatility(returns);

  const maxDrawdown = calculateMaxDrawdown(klines);

  const downsideVolatility = calculateDownsideVolatility(returns);

  const sharpeRatio = calculateSharpeRatio(returns);

  const sortinoRatio = calculateSortinoRatio(returns);

  const calmarRatio = calculateCalmarRatio(annualizedReturn, maxDrawdown);

  const positive = returns.filter((r) => r > 0);
  const negative = returns.filter((r) => r < 0);
  const flat = returns.filter((r) => r === 0);

  const averageUp = mean(positive);
  const averageDown = mean(negative);

  const upDownDayRatio = safeDivide(positive.length, negative.length);

  const gainLossRatio =
    averageUp !== null && averageDown !== null && averageDown !== 0
      ? averageUp / Math.abs(averageDown)
      : null;

  const rollingReturns = calculateRollingReturns(klines, 20);

  const streaks = calculateStreaks(returns);

  const amounts = klines.slice(1).map((item) => item.amount);

  const volumes = klines.slice(1).map((item) => item.volume);

  const latest = klines[klines.length - 1];

  const amountAverage = mean(amounts);

  const dailyRanges = klines
    .slice(1)
    .map((item, index) => (item.high - item.low) / klines[index].close);

  const activeDays = klines.slice(1).filter((item) => item.amount > 0).length;

  const tradingDays = returns.length;

  return {
    returns: {
      totalReturn,
      annualizedReturn,
      dailyReturnMean: mean(returns),
      dailyReturnMedian: median(returns),
      bestRollingReturn: max(rollingReturns),
      worstRollingReturn: min(rollingReturns),
    },

    risk: {
      volatility,

      volatilityAnalysis: getRiskLevel(volatility, 0.15, 0.3),

      maxDrawdown,

      maxDrawdownAnalysis: getRiskLevel(
        maxDrawdown === null ? null : Math.abs(maxDrawdown),
        0.1,
        0.25,
      ),

      downsideVolatility,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
    },

    dailyChanges: {
      upDays: positive.length,
      downDays: negative.length,
      flatDays: flat.length,

      upDayRatio: safeDivide(positive.length, tradingDays),

      downDayRatio: safeDivide(negative.length, tradingDays),

      upDownDayRatio,

      averageUpReturn: averageUp,
      averageDownReturn: averageDown,

      largestDailyGain: max(returns),
      largestDailyLoss: min(returns),

      gainLossRatio,
      averageDailyRange: mean(dailyRanges),
    },

    streaks: {
      maxConsecutiveUpDays: streaks.maxUp,
      maxConsecutiveDownDays: streaks.maxDown,

      currentConsecutiveUpDays: streaks.currentUp,
      currentConsecutiveDownDays: streaks.currentDown,

      maxConsecutiveUpReturn: streaks.maxUpReturn,
      maxConsecutiveDownReturn: streaks.maxDownReturn,
    },

    trading: {
      averageAmount: amountAverage,
      medianAmount: median(amounts),
      minAmount: min(amounts),
      maxAmount: max(amounts),
      amountStdDev: standardDeviation(amounts),

      latestAmount: latest.amount,

      amountRatio: safeDivide(latest.amount, amountAverage ?? 0),

      amountPercentile: percentileRank(amounts, latest.amount),

      averageVolume: mean(volumes),
      latestVolume: latest.volume,

      activeDays,

      activeDayRatio: safeDivide(activeDays, tradingDays),
    },
  };
}

function calculatePerformance(
  klines: Kline[],
): Record<PerformancePeriod, PeriodPerformance | null> {
  const result = {} as Record<PerformancePeriod, PeriodPerformance | null>;

  for (const period of PERIODS) {
    const periodKlines = getPeriodKlines(klines, period);

    result[period] = calculatePeriodPerformance(periodKlines);
  }

  return result;
}

// ============================================================
// 21. 估值计算
// ============================================================

function getValuationLevel(percent: number | null): ValuationLevel {
  if (percent === null) return "unknown";

  if (percent <= 30) return "low";
  if (percent <= 70) return "medium";

  return "high";
}

function getValuationAtOrBefore(
  values: Valuation[],
  date: number,
): Valuation | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i].date <= date) {
      return values[i];
    }
  }

  return null;
}

function calculateValuationChange(
  values: Valuation[],
  latest: Valuation,
  months: number,
): number | null {
  const targetDate = subtractMonths(latest.date, months);

  const previous = getValuationAtOrBefore(values, targetDate);

  if (!previous || previous.value === 0) {
    return null;
  }

  return latest.value / previous.value - 1;
}

function calculateValuationItem(values: Valuation[]): ValuationAnalysis | null {
  if (!values.length) return null;

  const latest = values[values.length - 1];

  const historicalValues = values.map((item) => item.value);

  return {
    value: latest.value,
    percent: latest.percent,

    level: getValuationLevel(latest.percent),

    historical: {
      min: min(historicalValues),
      max: max(historicalValues),
      mean: mean(historicalValues),
      median: median(historicalValues),
    },

    change: {
      change1m: calculateValuationChange(values, latest, 1),

      change3m: calculateValuationChange(values, latest, 3),

      change6m: calculateValuationChange(values, latest, 6),

      change1y: calculateValuationChange(values, latest, 12),
    },
  };
}

function calculateValuation(
  valuations: AnalyzeEtfInput["valuations"],
): EtfValuationAnalysis {
  return {
    PE: calculateValuationItem(normalizeValuations(valuations.PE, "PE")),

    PB: calculateValuationItem(normalizeValuations(valuations.PB, "PB")),

    PS: calculateValuationItem(normalizeValuations(valuations.PS, "PS")),
  };
}

// ============================================================
// 22. 均线计算
// ============================================================

function movingAverage(values: number[], period: number): number | null {
  if (values.length < period) return null;

  return mean(values.slice(-period));
}

function calculateTrend(klines: Kline[]): TrendAnalysis {
  const closes = klines.map((item) => item.close);

  const latestClose = closes[closes.length - 1];

  const movingAverages = {} as Record<MovingAveragePeriod, number | null>;

  const maDeviation = {} as Record<MovingAveragePeriod, number | null>;

  const validMAs: number[] = [];

  for (const key of MA_PERIODS) {
    const period = Number(key.slice(2));

    const ma = movingAverage(closes, period);

    movingAverages[key] = ma;

    maDeviation[key] = ma === null ? null : latestClose / ma - 1;

    if (ma !== null) {
      validMAs.push(ma);
    }
  }

  let alignment: MovingAverageAlignment = "unknown";

  if (validMAs.length >= 3) {
    const bullish = validMAs.every(
      (value, index) => index === 0 || validMAs[index - 1] > value,
    );

    const bearish = validMAs.every(
      (value, index) => index === 0 || validMAs[index - 1] < value,
    );

    if (bullish) {
      alignment = "bullish";
    } else if (bearish) {
      alignment = "bearish";
    } else {
      alignment = "mixed";
    }
  }

  const ma20 = movingAverage(closes, 20);
  const ma60 = movingAverage(closes, 60);

  let direction: TrendDirection = "unknown";

  if (ma20 !== null && ma60 !== null) {
    if (latestClose > ma20 && ma20 > ma60) {
      direction = "bullish";
    } else if (latestClose < ma20 && ma20 < ma60) {
      direction = "bearish";
    } else {
      direction = "sideways";
    }
  }

  let strength: number | null = null;

  if (ma20 !== null && ma60 !== null) {
    const deviation20 = latestClose / ma20 - 1;
    const deviation60 = latestClose / ma60 - 1;

    strength = Math.min(
      100,
      Math.abs(deviation20) * 200 + Math.abs(deviation60) * 100,
    );
  }

  return {
    movingAverages,
    maDeviation,
    alignment,
    direction,
    strength,
  };
}

// ============================================================
// 23. 价格位置
// ============================================================

function calculatePricePosition(klines: Kline[]): PricePositionAnalysis {
  const closes = klines.map((item) => item.close);

  const latest = closes[closes.length - 1];

  const historicalHigh = max(closes);
  const historicalLow = min(closes);

  function getPercentile(window: number): number | null {
    const values = closes.slice(-window);

    if (values.length < window) return null;

    return percentileRank(values, latest);
  }

  function getHigh(window: number): number | null {
    const values = closes.slice(-window);

    return values.length === window ? max(values) : null;
  }

  function getLow(window: number): number | null {
    const values = closes.slice(-window);

    return values.length === window ? min(values) : null;
  }

  return {
    historical: {
      highestPrice: historicalHigh,
      lowestPrice: historicalLow,

      distanceFromHigh:
        historicalHigh === null ? null : latest / historicalHigh - 1,

      distanceFromLow:
        historicalLow === null || historicalLow === 0
          ? null
          : latest / historicalLow - 1,
    },

    percentile: {
      day20: getPercentile(20),
      day60: getPercentile(60),
      day120: getPercentile(120),
      day250: getPercentile(250),
      all: percentileRank(closes, latest),
    },

    periods: {
      high20: getHigh(20),
      low20: getLow(20),

      high60: getHigh(60),
      low60: getLow(60),

      high120: getHigh(120),
      low120: getLow(120),
    },
  };
}

// ============================================================
// 24. ATR
// ============================================================

function calculateTrueRanges(klines: Kline[]): number[] {
  const ranges: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const current = klines[i];
    const previous = klines[i - 1];

    ranges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
      ),
    );
  }

  return ranges;
}

function calculateATR(klines: Kline[], period = 14): number | null {
  const ranges = calculateTrueRanges(klines);

  if (ranges.length < period) return null;

  return mean(ranges.slice(-period));
}

// ============================================================
// 25. 布林带
// ============================================================

function calculateBollinger(
  klines: Kline[],
  period = 20,
  multiplier = 2,
): BollingerAnalysis {
  const closes = klines.map((item) => item.close);

  if (closes.length < period) {
    return {
      upper: null,
      middle: null,
      lower: null,
      bandwidth: null,
      position: null,
    };
  }

  const values = closes.slice(-period);

  const middle = mean(values)!;
  const std = standardDeviation(values);

  if (std === null || middle === 0) {
    return {
      upper: null,
      middle: null,
      lower: null,
      bandwidth: null,
      position: null,
    };
  }

  const upper = middle + multiplier * std;
  const lower = middle - multiplier * std;

  const latest = closes[closes.length - 1];

  return {
    upper,
    middle,
    lower,

    bandwidth: (upper - lower) / middle,

    position: upper === lower ? null : (latest - lower) / (upper - lower),
  };
}

// ============================================================
// 26. 历史波动率
// ============================================================

function calculateHistoricalVolatility(
  klines: Kline[],
  period: number,
): number | null {
  if (klines.length < period + 1) {
    return null;
  }

  const returns = getDailyReturns(klines.slice(-(period + 1)));

  return calculateVolatility(returns);
}

function calculateVolatilityAnalysis(klines: Kline[]): VolatilityAnalysis {
  const latestClose = klines[klines.length - 1].close;

  const atr14 = calculateATR(klines, 14);

  return {
    atr: {
      atr14,

      atrPercent: atr14 === null ? null : atr14 / latestClose,
    },

    bollinger: calculateBollinger(klines),

    historicalVolatility: {
      day20: calculateHistoricalVolatility(klines, 20),

      day60: calculateHistoricalVolatility(klines, 60),

      day120: calculateHistoricalVolatility(klines, 120),
    },
  };
}

// ============================================================
// 27. 成交特征
// ============================================================

function calculateTradingActivity(klines: Kline[]): TradingActivityAnalysis {
  const latest = klines[klines.length - 1];

  const amounts = klines.map((item) => item.amount);

  const volumes = klines.map((item) => item.volume);

  function averageAmount(period: number): number | null {
    const values = amounts.slice(-period);

    if (values.length < period) return null;

    return mean(values);
  }

  function averageVolume(period: number): number | null {
    const values = volumes.slice(-period);

    if (values.length < period) return null;

    return mean(values);
  }

  const amount5 = averageAmount(5);
  const amount20 = averageAmount(20);
  const amount60 = averageAmount(60);

  const volume5 = averageVolume(5);
  const volume20 = averageVolume(20);
  const volume60 = averageVolume(60);

  let priceVolumeStatus: PriceVolumeStatus = "unknown";

  const recent5 = klines.slice(-5);
  const previous5 = klines.slice(-10, -5);

  if (recent5.length === 5 && previous5.length === 5) {
    const priceChange = recent5[4].close / recent5[0].close - 1;

    const recentAmount = mean(recent5.map((item) => item.amount))!;

    const previousAmount = mean(previous5.map((item) => item.amount))!;

    const amountChange = safeDivide(
      recentAmount - previousAmount,
      previousAmount,
    );

    if (amountChange !== null) {
      if (priceChange > 0 && amountChange > 0) {
        priceVolumeStatus = "volume_price_rise";
      } else if (priceChange < 0 && amountChange > 0) {
        priceVolumeStatus = "volume_price_fall";
      } else if (priceChange > 0 && amountChange < 0) {
        priceVolumeStatus = "price_rise_volume_fall";
      } else if (priceChange < 0 && amountChange < 0) {
        priceVolumeStatus = "price_fall_volume_rise";
      } else {
        priceVolumeStatus = "neutral";
      }
    }
  }

  return {
    amount: {
      latest: latest.amount,

      average5: amount5,
      average20: amount20,
      average60: amount60,

      ratio5: safeDivide(latest.amount, amount5 ?? 0),

      ratio20: safeDivide(latest.amount, amount20 ?? 0),

      percentile: percentileRank(amounts, latest.amount),
    },

    volume: {
      latest: latest.volume,

      average5: volume5,
      average20: volume20,
      average60: volume60,

      ratio20: safeDivide(latest.volume, volume20 ?? 0),
    },

    priceVolume: {
      status: priceVolumeStatus,
    },
  };
}

// ============================================================
// 28. 主函数
// ============================================================

/**
 * 分析单个 ETF
 *
 * @param input K线和估值数据
 * @returns ETF 分析结果；没有有效K线时返回 null
 */
export function analyzeEtf(input: AnalyzeEtfInput): EtfAnalysis | null {
  const klines = normalizeKlines(input.klines);

  if (!klines.length) {
    return null;
  }

  const first = klines[0];
  const latest = klines[klines.length - 1];

  return {
    code: latest.code,
    startDate: first.date,

    latestDate: latest.date,
    tradingDays: klines.length,

    market: latest,

    performance: calculatePerformance(klines),

    valuation: calculateValuation(input.valuations),

    trend: calculateTrend(klines),

    pricePosition: calculatePricePosition(klines),

    volatility: calculateVolatilityAnalysis(klines),

    tradingActivity: calculateTradingActivity(klines),
  };
}
