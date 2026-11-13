import type { Kline } from "../../prisma/index.js";
import { calculateReturns, mean, quantile, sampleStd } from "./utils.js";

/** 补充指标结果。数组类字段与输入 klines 逐位对齐。 */
export interface SupplementaryResult {
  /** 截至最后一个交易日的连续上涨天数 */
  upStreak: number;
  /** 截至最后一个交易日的连续下跌天数 */
  downStreak: number;
  /** 最后一个收盘价在自身历史中的分位（0~1）；仅单标的序列内有意义 */
  pricePercentile: number | null;
  /** 历史单日最大涨幅（用 high / prevClose - 1） */
  maxUpDay: number | null;
  /** 历史单日最大跌幅（用 low / prevClose - 1，负数） */
  maxDownDay: number | null;
  /** 日内振幅：(H - L) / prevClose；首日 null */
  amplitude: Array<number | null>;
  /** 跳空缺口：open / prevClose - 1；首日 null */
  gap: Array<number | null>;
  /** 当日均价近似：amount / volume；volume=0 时 null（非严格 VWAP） */
  vwap: Array<number | null>;
  /** 量比：volume[t] / 前 5 日均量；前 5 日不足 null */
  volumeRatio: Array<number | null>;
  /** 历史 VaR(95%)：-quantile(returns, 0.05) */
  var95: number | null;
  /** 历史 CVaR(95%)：尾部（r <= 5% 分位）均值的相反数 */
  cvar95: number | null;
  /** 收益偏度（样本口径，n>=3 才有值） */
  skewness: number | null;
  /** 收益超额峰度（样本口径，n>=4 才有值） */
  kurtosis: number | null;
}

/**
 * 计算补充指标（L1 + L2 + L3）。
 *
 * 入参 klines 必须升序。所有数组与 klines 逐位对齐，数据不足填 null。
 *
 * 口径说明：
 * - 连续涨跌天数从最后一天向前数，遇平盘（r=0）即停止。
 * - pricePercentile 只在本标的自身历史内有意义，前复权下不可跨标的比较。
 * - vwap 是 amount/volume 的日均价近似，不是分时 VWAP。
 * - VaR/CVaR 为历史分位数法，不做参数化假设。
 * - 偏度/峰度为样本调整公式，n 不足时返回 null。
 */
export function calculateSupplementary(
  klines: readonly Kline[],
): SupplementaryResult {
  const n = klines.length;
  const returns = calculateReturns(klines);

  let upStreak = 0;
  for (let i = returns.length - 1; i >= 0 && returns[i] > 0; i--) upStreak++;
  let downStreak = 0;
  for (let i = returns.length - 1; i >= 0 && returns[i] < 0; i--) downStreak++;

  const last = klines[n - 1];
  const pricePercentile =
    n > 0 && last
      ? klines.filter((k) => k.close <= last.close).length / n
      : null;

  let maxUpDay: number | null = null;
  let maxDownDay: number | null = null;
  for (let i = 1; i < n; i++) {
    const up = klines[i].high / klines[i - 1].close - 1;
    const down = klines[i].low / klines[i - 1].close - 1;
    if (maxUpDay === null || up > maxUpDay) maxUpDay = up;
    if (maxDownDay === null || down < maxDownDay) maxDownDay = down;
  }

  const amplitude: Array<number | null> = Array(n).fill(null);
  const gap: Array<number | null> = Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    amplitude[i] =
      klines[i - 1].close > 0
        ? (klines[i].high - klines[i].low) / klines[i - 1].close
        : null;
    gap[i] =
      klines[i - 1].close > 0 ? klines[i].open / klines[i - 1].close - 1 : null;
  }

  const vwap: Array<number | null> = klines.map((k) =>
    k.volume > 0 ? k.amount / k.volume : null,
  );

  const volumeRatio: Array<number | null> = Array(n).fill(null);
  const vrWindow = 5;
  for (let i = vrWindow; i < n; i++) {
    const avg =
      klines.slice(i - vrWindow, i).reduce((a, k) => a + k.volume, 0) /
      vrWindow;
    volumeRatio[i] = avg > 0 ? klines[i].volume / avg : null;
  }

  const q05 = quantile(returns, 0.05);
  const var95 = q05 === null ? null : -q05;
  const tail = q05 === null ? [] : returns.filter((r) => r <= q05);
  const cvar95 =
    q05 === null || tail.length === 0
      ? null
      : -(tail.reduce((a, b) => a + b, 0) / tail.length);

  let skewness: number | null = null;
  let kurtosis: number | null = null;
  const m = returns.length;
  const sd = sampleStd(returns);
  if (sd !== null && sd !== 0 && m >= 3) {
    const avg = mean(returns)!;
    let s3 = 0;
    let s4 = 0;
    for (const r of returns) {
      const z = (r - avg) / sd;
      s3 += z ** 3;
      s4 += z ** 4;
    }
    // 样本偏度：n / ((n-1)(n-2)) * Σz³
    skewness = (m / ((m - 1) * (m - 2))) * s3;
    if (m >= 4) {
      // 样本超额峰度
      kurtosis =
        ((m * (m + 1)) / ((m - 1) * (m - 2) * (m - 3))) * s4 -
        (3 * (m - 1) ** 2) / ((m - 2) * (m - 3));
    }
  }

  return {
    upStreak,
    downStreak,
    pricePercentile,
    maxUpDay,
    maxDownDay,
    amplitude,
    gap,
    vwap,
    volumeRatio,
    var95,
    cvar95,
    skewness,
    kurtosis,
  };
}
