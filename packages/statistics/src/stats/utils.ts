import { Kline } from "@maga/db";

/**
 * 返回按 date 升序的新数组，不修改入参。
 *
 * 用途：编排层（getCalcTask.save）入口调用一次，保证下游纯函数拿到升序数据。
 * 纯函数内部不再排序，避免重复排序和隐式副作用。
 */
export function ensureAscending(klines: readonly Kline[]): Kline[] {
  return [...klines].sort((a, b) => a.date - b.date);
}

/** Date -> YYYYMMDD 整数。使用本地时区，避免 UTC 偏移导致日期错一天。 */
export function dateToInt(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** YYYYMMDD 整数 -> Date（本地时区零点的 Date）。 */
export function intToDate(v: number): Date {
  const y = Math.floor(v / 10000);
  const m = Math.floor((v % 10000) / 100);
  const d = v % 100;
  return new Date(y, m - 1, d);
}

/**
 * 单日收益率：close / prevClose - 1。
 *
 * 边界：prevClose <= 0 时返回 0，避免除零得到 Infinity/NaN。
 * 口径：统一用相邻 close 重算，不使用 changePercent（口径可能不同）。
 */
export function calcDailyReturn(prevClose: number, close: number): number {
  if (prevClose <= 0) return 0;
  return close / prevClose - 1;
}

/**
 * 由 Kline 序列计算日收益数组。
 *
 * 返回长度 = klines.length - 1；klines 少于 2 条时返回空数组。
 * 第 i 个元素对应 klines[i+1].date 当天的收益。
 */
export function calculateReturns(klines: readonly Kline[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    out.push(calcDailyReturn(klines[i - 1].close, klines[i].close));
  }
  return out;
}

/**
 * 由日收益数组生成净值曲线，起始值为 1。
 *
 * 返回长度 = returns.length + 1；nav[0] = 1，nav[i+1] = nav[i] * (1 + returns[i])。
 * 与 Kline 日期对齐时，nav[i] 对应 klines[i]，nav[0] 是起点、不对应某条 Kline。
 */
export function calculateNAV(returns: readonly number[]): number[] {
  const nav: number[] = [1];
  for (const r of returns) nav.push(nav[nav.length - 1] * (1 + r));
  return nav;
}

/**
 * 样本标准差（ddof = 1，除以 n - 1）。
 *
 * 边界：n < 2 返回 null，避免除以 0 得到 NaN。
 * 用途：波动率、布林带、偏度/峰度分母。
 */
export function sampleStd(xs: readonly number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  let s = 0;
  for (const x of xs) s += (x - mean) ** 2;
  return Math.sqrt(s / (n - 1));
}

/** 算术平均。空数组返回 null。 */
export function mean(xs: readonly number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * 分位数（线性插值），p ∈ [0, 1]。
 *
 * 边界：空数组返回 null；p=0 返回最小值，p=1 返回最大值。
 * 用途：历史 VaR / CVaR、成交额分位数。
 */
export function quantile(xs: readonly number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 按日期闭区间过滤。startDate/endDate 为 undefined 时该侧不限制。
 *
 * 注意：返回新数组，不修改入参；调用方保证入参已升序。
 */
export function filterByRange(
  klines: readonly Kline[],
  startDate?: number,
  endDate?: number,
): Kline[] {
  return klines.filter(
    (k) =>
      (startDate === undefined || k.date >= startDate) &&
      (endDate === undefined || k.date <= endDate),
  );
}
