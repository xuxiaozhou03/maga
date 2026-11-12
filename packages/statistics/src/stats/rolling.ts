import { Kline } from "@maga/db";
import { TRADING_DAYS_PER_YEAR } from "./types";
import { calculateReturns, calculateNAV, filterByRange } from "./utils";

/** 滚动指标结果。dates/nav/rollingReturn 三者与过滤后 Kline 日期逐位对齐。 */
export interface RollingResult {
  /** 过滤后 Kline 的日期序列 */
  dates: number[];
  /** 净值曲线，起始 1，长度 = dates.length，nav[i] 对应 dates[i] */
  nav: number[];
  /** 滚动收益，长度 = dates.length */
  rollingReturn: Array<{
    date: number;
    /** 窗口 w 的区间收益：close[t] / close[t-w] - 1；t < w 时 null */
    return: number | null;
    /** 滚动年化：(1 + return)^(252/w) - 1；t < w 时 null */
    annualizedReturn: number | null;
  }>;
}

/**
 * 计算滚动收益与净值曲线（L1，仅依赖 close）。
 *
 * 入参 klines 必须升序；window 为正整数（如 20/60/120/250）。
 *
 * 对齐规则：
 * - 返回数组长度等于过滤后 Kline 数量，不截断。
 * - 窗口不足的位置填 null，不用前值补齐。
 * - nav 起始值为 1，与 dates 逐位对齐（nav[0] 对应 dates[0]）。
 *
 * 边界：window <= 0 或非整数时抛错，避免静默产生错误结果。
 */
export function calculateRollingMetrics(
  klines: readonly Kline[],
  window: number,
  options?: { startDate?: number; endDate?: number },
): RollingResult {
  if (!Number.isInteger(window) || window <= 0) {
    throw new Error("window must be a positive integer");
  }
  const data = filterByRange(klines, options?.startDate, options?.endDate);
  const returns = calculateReturns(data);
  const navRaw = calculateNAV(returns);
  // navRaw 长度 = data.length + 1，去掉起点使其与 data 对齐
  const nav = navRaw.slice(1);
  const dates = data.map((k) => k.date);
  const rollingReturn: RollingResult["rollingReturn"] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window) {
      rollingReturn.push({
        date: dates[i],
        return: null,
        annualizedReturn: null,
      });
      continue;
    }
    const r = data[i].close / data[i - window].close - 1;
    const ann = Math.pow(1 + r, TRADING_DAYS_PER_YEAR / window) - 1;
    rollingReturn.push({ date: dates[i], return: r, annualizedReturn: ann });
  }
  return { dates, nav, rollingReturn };
}
