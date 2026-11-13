import type { Kline } from "../../prisma/index.js";
import { TRADING_DAYS_PER_YEAR, DEFAULT_RISK_FREE_RATE } from "./types.js";
import {
  calculateReturns,
  calculateNAV,
  sampleStd,
  mean,
  filterByRange,
} from "./utils.js";

/** 最大回撤计算结果。索引均指向 nav 数组。 */
export interface MaxDrawdownResult {
  /** 最大回撤，负数或 0（如 -0.25 表示回撤 25%） */
  mdd: number;
  /** 回撤起点（峰值）在 nav 中的索引 */
  startIdx: number;
  /** 回撤终点（谷值）在 nav 中的索引 */
  endIdx: number;
}

/**
 * 计算最大回撤。
 *
 * 公式：peak_t = max_{i<=t} nav[i]；dd_t = nav[t] / peak_t - 1；MDD = min_t dd_t。
 * 返回峰值索引和谷值索引，便于映射回日期。
 *
 * 边界：nav 为空返回 { mdd: 0, startIdx: 0, endIdx: 0 }；
 *       nav 单调不跌时 mdd = 0，startIdx = endIdx = 0。
 */
export function calculateMaxDrawdown(
  nav: readonly number[],
): MaxDrawdownResult {
  if (nav.length === 0) return { mdd: 0, startIdx: 0, endIdx: 0 };
  let peak = nav[0];
  let peakIdx = 0;
  let mdd = 0;
  let startIdx = 0;
  let endIdx = 0;
  for (let i = 1; i < nav.length; i++) {
    if (nav[i] > peak) {
      peak = nav[i];
      peakIdx = i;
    }
    const dd = nav[i] / peak - 1;
    if (dd < mdd) {
      mdd = dd;
      startIdx = peakIdx;
      endIdx = i;
    }
  }
  return { mdd, startIdx, endIdx };
}

/** 核心收益与风险指标。所有收益类字段为小数，0.01 表示 1%。 */
export interface CoreMetrics {
  code: string;
  /** 实际参与计算的区间和交易日数（过滤后） */
  period: { start: number; end: number; tradingDays: number };

  /** 累计收益：∏(1+r) - 1 */
  totalReturn: number | null;
  /** 简单年化：avgDailyReturn * 252 */
  annualizedReturnSimple: number | null;
  /** 复利年化：(1+R)^(252/N) - 1 */
  annualizedReturnCompound: number | null;
  /** 平均日收益 */
  avgDailyReturn: number | null;
  /** 正收益天数 / 总天数 */
  positiveDaysRatio: number | null;

  /** 日波动率（样本标准差，ddof=1） */
  volatilityDaily: number | null;
  /** 年化波动率：volatilityDaily * sqrt(252) */
  volatilityAnnualized: number | null;
  /** 下行波动率：只用 r < 0 的样本；负样本 >= 2 用 ddof=1，仅 1 个用 |r|，0 个为 null */
  downsideVolatility: number | null;
  /** 最大回撤（负数） */
  maxDrawdown: number | null;
  /** 最大回撤起点日期（峰值日） */
  maxDrawdownStartDate: number | null;
  /** 最大回撤终点日期（谷值日） */
  maxDrawdownEndDate: number | null;
  /** 当前回撤：nav_last / peak_last - 1 */
  currentDrawdown: number | null;

  /** 夏普：(R_ann - rf) / σ_ann；σ_ann=0 时 null */
  sharpeRatio: number | null;
  /** 索提诺：(R_ann - rf) / σ_down；σ_down=0 时 null */
  sortinoRatio: number | null;
  /** 卡玛：R_ann / |MDD|；MDD=0 时 null */
  calmarRatio: number | null;

  /** 胜率：正收益天数 / 非零收益天数；无非零收益时 null */
  winRate: number | null;
  /** 盈亏比：正收益均值 / |负收益均值|；缺任一侧时 null */
  profitLossRatio: number | null;
  /** 盈利因子：正收益总和 / |负收益总和|；无亏损时 null（不用 Infinity） */
  profitFactor: number | null;
}

/**
 * 计算核心收益与风险指标（L1，仅依赖 close）。
 *
 * 入参 klines 必须按 date 升序；options 可指定闭区间和年化无风险利率。
 * 少于 2 条有效 Kline 时返回全 null 结构（period 为 0）。
 *
 * 口径：
 * - 日收益用相邻 close 重算，不用 changePercent。
 * - 年化统一 252 交易日。
 * - riskFreeRate 为年化小数，与 R_ann 同口径相减，默认 0。
 * - 最大回撤起止日期：nav 索引 i 对应 klines[i]（nav[0] 为起点，不对应 Kline），
 *   故 startIdx/endIdx 映射为 data[startIdx]、data[endIdx]。
 */
export function calculateCoreMetrics(
  klines: readonly Kline[],
  options?: { startDate?: number; endDate?: number; riskFreeRate?: number },
): CoreMetrics {
  const rf = options?.riskFreeRate ?? DEFAULT_RISK_FREE_RATE;
  const data = filterByRange(klines, options?.startDate, options?.endDate);
  const code = data[0]?.code ?? "";

  const empty: CoreMetrics = {
    code,
    period: { start: 0, end: 0, tradingDays: 0 },
    totalReturn: null,
    annualizedReturnSimple: null,
    annualizedReturnCompound: null,
    avgDailyReturn: null,
    positiveDaysRatio: null,
    volatilityDaily: null,
    volatilityAnnualized: null,
    downsideVolatility: null,
    maxDrawdown: null,
    maxDrawdownStartDate: null,
    maxDrawdownEndDate: null,
    currentDrawdown: null,
    sharpeRatio: null,
    sortinoRatio: null,
    calmarRatio: null,
    winRate: null,
    profitLossRatio: null,
    profitFactor: null,
  };
  if (data.length < 2) return empty;

  const returns = calculateReturns(data);
  const n = returns.length;
  const nav = calculateNAV(returns);
  const avg = mean(returns)!;
  const totalReturn = nav[nav.length - 1] - 1;
  const annSimple = avg * TRADING_DAYS_PER_YEAR;
  const annCompound = Math.pow(1 + totalReturn, TRADING_DAYS_PER_YEAR / n) - 1;
  const posRatio = returns.filter((r) => r > 0).length / n;

  const stdDaily = sampleStd(returns);
  const volDaily = stdDaily;
  const volAnn =
    stdDaily === null ? null : stdDaily * Math.sqrt(TRADING_DAYS_PER_YEAR);

  const negatives = returns.filter((r) => r < 0);
  const downVol =
    negatives.length >= 2
      ? Math.sqrt(
          negatives.reduce((a, r) => a + r * r, 0) / (negatives.length - 1),
        )
      : negatives.length === 1
        ? Math.abs(negatives[0])
        : null;

  const { mdd, startIdx, endIdx } = calculateMaxDrawdown(nav);
  const mddStartDate = data[startIdx]?.date ?? null;
  const mddEndDate = data[endIdx]?.date ?? null;

  let peak = nav[0];
  for (const v of nav) if (v > peak) peak = v;
  const currentDD = nav[nav.length - 1] / peak - 1;

  const sharpe =
    volAnn !== null && volAnn !== 0 ? (annCompound - rf) / volAnn : null;
  const sortino =
    downVol !== null && downVol !== 0 ? (annCompound - rf) / downVol : null;
  const calmar = mdd !== 0 ? annCompound / Math.abs(mdd) : null;

  const positives = returns.filter((r) => r > 0);
  const nonZero = returns.filter((r) => r !== 0);
  const winRate = nonZero.length > 0 ? positives.length / nonZero.length : null;
  const posAvg = mean(positives);
  const negAvg = mean(negatives);
  const profitLossRatio =
    posAvg !== null && negAvg !== null && negAvg !== 0
      ? posAvg / Math.abs(negAvg)
      : null;
  const posSum = positives.reduce((a, r) => a + r, 0);
  const negSum = negatives.reduce((a, r) => a + r, 0);
  const profitFactor =
    negatives.length > 0 && negSum !== 0 ? posSum / Math.abs(negSum) : null;

  return {
    code,
    period: {
      start: data[0].date,
      end: data[data.length - 1].date,
      tradingDays: data.length,
    },
    totalReturn,
    annualizedReturnSimple: annSimple,
    annualizedReturnCompound: annCompound,
    avgDailyReturn: avg,
    positiveDaysRatio: posRatio,
    volatilityDaily: volDaily,
    volatilityAnnualized: volAnn,
    downsideVolatility: downVol,
    maxDrawdown: mdd,
    maxDrawdownStartDate: mddStartDate,
    maxDrawdownEndDate: mddEndDate,
    currentDrawdown: currentDD,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    calmarRatio: calmar,
    winRate,
    profitLossRatio,
    profitFactor,
  };
}
