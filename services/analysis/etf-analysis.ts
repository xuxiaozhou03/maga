/**
 * 单只 ETF 的行情统计与数据特征。
 *
 * 纯函数：输入一段升序 K 线，输出统计结果，不触碰数据库。
 * 收益与风险指标复用回测引擎的 `computeMetrics`，保证口径一致。
 */

import { roundMoney } from "@/lib/math";
import { isValidYmd, type Ymd } from "@/lib/dates";
import { computeMetrics } from "@/services/backtest/metrics/metrics";
import type { DailyRecord } from "@/services/backtest/types";
import {
  validateKlines,
  type MarketDataIssue,
  type ValidatableBar,
} from "@/services/market-data/validator";

export type ExtremeDay = {
  date: Ymd;
  value: number;
};

export type ReturnBin = {
  /** 区间下界（含）。 */
  from: number;
  /** 区间上界（不含）。 */
  to: number;
  count: number;
};

export type EtfDataQuality = {
  checkedBars: number;
  errors: number;
  warnings: number;
  /** 明细，最多保留前 20 条。 */
  issues: MarketDataIssue[];
};

export type EtfAnalysis = {
  count: number;
  firstDate: Ymd | null;
  lastDate: Ymd | null;
  firstClose: number | null;
  lastClose: number | null;
  minClose: number | null;
  maxClose: number | null;

  /** 区间买入持有表现，指标口径与回测一致。 */
  totalReturn: number | null;
  annualizedReturn: number | null;
  annualizedVolatility: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;

  /** 日收益特征。 */
  averageDailyReturn: number | null;
  bestDay: ExtremeDay | null;
  worstDay: ExtremeDay | null;
  upDayRatio: number | null;

  /** 流动性特征。 */
  averageVolume: number | null;
  averageAmount: number | null;
  maxAmountDay: ExtremeDay | null;

  /** 相邻交易日最大自然日间隔，用于发现长时间停牌或缺数据。 */
  maxGapDays: number | null;

  /** 每日收盘序列（用于画价格与回撤曲线）。 */
  points: { date: Ymd; close: number; drawdown: number | null }[];

  /** 日收益分布，用于直方图。 */
  returnDistribution: ReturnBin[];

  quality: EtfDataQuality;
};

const ISSUE_LIMIT = 20;
const BIN_COUNT = 21;

function toUtc(value: Ymd): number | null {
  if (!isValidYmd(value)) return null;
  const year = Math.floor(value / 10000);
  const month = Math.floor((value % 10000) / 100);
  const day = value % 100;
  return Date.UTC(year, month - 1, day);
}

function buildDistribution(returns: readonly ExtremeDay[]): ReturnBin[] {
  if (returns.length === 0) return [];

  const values = returns.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return [{ from: min, to: max, count: values.length }];
  }

  const width = (max - min) / BIN_COUNT;
  const bins: ReturnBin[] = Array.from({ length: BIN_COUNT }, (_, index) => ({
    from: min + index * width,
    to: min + (index + 1) * width,
    count: 0,
  }));

  for (const value of values) {
    const raw = Math.floor((value - min) / width);
    const index = Math.min(Math.max(raw, 0), BIN_COUNT - 1);
    bins[index].count += 1;
  }

  return bins;
}

/**
 * 分析一段升序 K 线。
 *
 * 输入假定已按日期升序；顺序异常会在 `quality.issues` 中体现。
 */
export function analyzeKlines(bars: readonly ValidatableBar[]): EtfAnalysis {
  const empty: EtfAnalysis = {
    count: 0,
    firstDate: null,
    lastDate: null,
    firstClose: null,
    lastClose: null,
    minClose: null,
    maxClose: null,
    totalReturn: null,
    annualizedReturn: null,
    annualizedVolatility: null,
    maxDrawdown: null,
    sharpeRatio: null,
    averageDailyReturn: null,
    bestDay: null,
    worstDay: null,
    upDayRatio: null,
    averageVolume: null,
    averageAmount: null,
    maxAmountDay: null,
    maxGapDays: null,
    points: [],
    returnDistribution: [],
    quality: { checkedBars: 0, errors: 0, warnings: 0, issues: [] },
  };

  if (bars.length === 0) return empty;

  // 用收盘价构造等值曲线，直接复用引擎的指标口径。
  const closes = bars.map((bar) => bar.close);
  const dailyReturns: ExtremeDay[] = [];
  const points: EtfAnalysis["points"] = [];
  const returnByDate = new Map<Ymd, number>();

  let peak = closes[0];
  let upDays = 0;

  bars.forEach((bar, index) => {
    if (bar.close > peak) peak = bar.close;

    const drawdown = peak > 0 ? roundMoney(bar.close / peak - 1) : null;
    points.push({ date: bar.date, close: bar.close, drawdown });

    if (index === 0) return;
    const previous = closes[index - 1];
    if (!Number.isFinite(previous) || previous <= 0) return;

    const value = roundMoney(bar.close / previous - 1);
    dailyReturns.push({ date: bar.date, value });
    returnByDate.set(bar.date, value);
    if (value > 0) upDays += 1;
  });

  const dailyRecords: DailyRecord[] = points.map((point, index) => ({
    date: point.date,
    cash: point.close,
    marketValue: 0,
    totalAssets: point.close,
    realizedPnl: 0,
    unrealizedPnl: 0,
    fees: 0,
    dailyReturn: index === 0 ? null : (returnByDate.get(point.date) ?? null),
    drawdown: point.drawdown,
    positions: [],
  }));

  const metrics = computeMetrics({
    initialCash: closes[0],
    dailyRecords,
    orders: [],
    finalCash: closes[closes.length - 1],
    finalMarketValue: 0,
  });

  const averageDailyReturn =
    dailyReturns.length > 0
      ? roundMoney(dailyReturns.reduce((acc, item) => acc + item.value, 0) / dailyReturns.length)
      : null;

  let bestDay: ExtremeDay | null = null;
  let worstDay: ExtremeDay | null = null;
  for (const item of dailyReturns) {
    if (!bestDay || item.value > bestDay.value) bestDay = item;
    if (!worstDay || item.value < worstDay.value) worstDay = item;
  }

  const volumes = bars.map((bar) => bar.volume).filter((value) => Number.isFinite(value));
  const amounts = bars.map((bar) => bar.amount).filter((value) => Number.isFinite(value));

  let maxAmountDay: ExtremeDay | null = null;
  bars.forEach((bar) => {
    if (!Number.isFinite(bar.amount)) return;
    if (!maxAmountDay || bar.amount > maxAmountDay.value) {
      maxAmountDay = { date: bar.date, value: bar.amount };
    }
  });

  let maxGapDays: number | null = null;
  for (let i = 1; i < bars.length; i += 1) {
    const previous = toUtc(bars[i - 1].date);
    const current = toUtc(bars[i].date);
    if (previous === null || current === null) continue;
    const gap = Math.round((current - previous) / 86_400_000);
    if (maxGapDays === null || gap > maxGapDays) maxGapDays = gap;
  }

  const validation = validateKlines(bars);
  const errors = validation.issues.filter((issue) => issue.severity === "error").length;
  const warnings = validation.issues.filter((issue) => issue.severity === "warning").length;

  return {
    count: bars.length,
    firstDate: bars[0].date,
    lastDate: bars[bars.length - 1].date,
    firstClose: closes[0],
    lastClose: closes[closes.length - 1],
    minClose: Math.min(...closes),
    maxClose: Math.max(...closes),
    totalReturn: metrics.totalReturn,
    annualizedReturn: metrics.annualizedReturn,
    annualizedVolatility: metrics.annualizedVolatility,
    maxDrawdown: metrics.maxDrawdown,
    sharpeRatio: metrics.sharpeRatio,
    averageDailyReturn,
    bestDay,
    worstDay,
    upDayRatio: dailyReturns.length > 0 ? roundMoney(upDays / dailyReturns.length) : null,
    averageVolume:
      volumes.length > 0
        ? roundMoney(volumes.reduce((acc, value) => acc + value, 0) / volumes.length)
        : null,
    averageAmount:
      amounts.length > 0
        ? roundMoney(amounts.reduce((acc, value) => acc + value, 0) / amounts.length)
        : null,
    maxAmountDay,
    maxGapDays,
    points,
    returnDistribution: buildDistribution(dailyReturns),
    quality: {
      checkedBars: validation.barCount,
      errors,
      warnings,
      issues: validation.issues.slice(0, ISSUE_LIMIT),
    },
  };
}
