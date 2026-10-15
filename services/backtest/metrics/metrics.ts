/**
 * 收益与风险指标。
 *
 * 约定（对应 PRD 6.4 / 13.5）：
 * - 年化按 252 个交易日折算；
 * - 回撤与最大回撤均为负数或 0（-0.25 表示相对高点回撤 25%）；
 * - 数据不足时返回 null，并在 `reasons` 中给出原因，不静默填 0。
 */

import { mean, roundMoney, stdDev } from "@/lib/math";
import type { BacktestMetrics, DailyRecord, OrderRecord } from "@/services/backtest/types";

export const TRADING_DAYS_PER_YEAR = 252;

export type ComputeMetricsInput = {
  initialCash: number;
  dailyRecords: readonly DailyRecord[];
  orders: readonly OrderRecord[];
  finalCash: number;
  finalMarketValue: number;
  /** 年化无风险利率，默认 0。 */
  riskFreeRate?: number;
  tradingDaysPerYear?: number;
};

/** 最大回撤（负数或 0）。空序列返回 null。 */
export function maxDrawdown(equity: readonly number[]): number | null {
  if (equity.length === 0) return null;

  let peak = equity[0];
  let worst = 0;

  for (const value of equity) {
    if (value > peak) peak = value;
    if (peak > 0) {
      const drawdown = value / peak - 1;
      if (drawdown < worst) worst = drawdown;
    }
  }

  return roundMoney(worst);
}

export function computeMetrics(input: ComputeMetricsInput): BacktestMetrics {
  const {
    initialCash,
    dailyRecords,
    orders,
    finalCash,
    finalMarketValue,
    riskFreeRate = 0,
    tradingDaysPerYear = TRADING_DAYS_PER_YEAR,
  } = input;

  const reasons: Record<string, string> = {};
  const finalTotalAssets = roundMoney(finalCash + finalMarketValue);
  const filled = orders.filter((order) => order.status === "filled");
  const closed = filled.filter((order) => order.side === "sell" && order.realizedPnl !== null);

  const dailyReturns = dailyRecords
    .map((record) => record.dailyReturn)
    .filter((value): value is number => value !== null);

  const totalReturn =
    initialCash > 0 ? roundMoney(finalTotalAssets / initialCash - 1) : null;
  if (initialCash <= 0) reasons.totalReturn = "初始资金必须为正数";

  let annualizedReturn: number | null = null;
  if (dailyReturns.length === 0) {
    reasons.annualizedReturn = "没有可用的日收益序列";
  } else if (finalTotalAssets <= 0) {
    reasons.annualizedReturn = "期末总资产非正，无法计算年化收益";
  } else {
    const years = dailyReturns.length / tradingDaysPerYear;
    annualizedReturn = years > 0 ? roundMoney((finalTotalAssets / initialCash) ** (1 / years) - 1) : null;
    if (annualizedReturn === null) reasons.annualizedReturn = "回测区间过短";
  }

  const equity = dailyRecords.map((record) => record.totalAssets);
  const drawdown = maxDrawdown(equity);
  if (drawdown === null) reasons.maxDrawdown = "没有可用的资产序列";

  const sd = stdDev(dailyReturns);
  let annualizedVolatility: number | null = null;
  let sharpeRatio: number | null = null;

  if (dailyReturns.length < 2 || sd === null) {
    reasons.annualizedVolatility = "日收益样本不足";
    reasons.sharpeRatio = "日收益样本不足";
  } else if (sd === 0) {
    annualizedVolatility = 0;
    reasons.sharpeRatio = "日收益波动为 0";
  } else {
    annualizedVolatility = roundMoney(sd * Math.sqrt(tradingDaysPerYear));
    const avg = mean(dailyReturns) as number;
    const excessDaily = avg - riskFreeRate / tradingDaysPerYear;
    sharpeRatio = roundMoney((excessDaily / sd) * Math.sqrt(tradingDaysPerYear));
  }

  const wins = closed.filter((order) => (order.realizedPnl as number) > 0);
  const losses = closed.filter((order) => (order.realizedPnl as number) < 0);

  const winRate = closed.length > 0 ? roundMoney(wins.length / closed.length) : null;
  if (closed.length === 0) reasons.winRate = "没有已平仓交易";

  const averageWin = wins.length > 0 ? roundMoney(mean(wins.map((o) => o.realizedPnl as number)) as number) : null;
  if (wins.length === 0) reasons.averageWin = "没有盈利的平仓交易";

  const averageLoss =
    losses.length > 0 ? roundMoney(mean(losses.map((o) => o.realizedPnl as number)) as number) : null;
  if (losses.length === 0) reasons.averageLoss = "没有亏损的平仓交易";

  const totalFees = roundMoney(filled.reduce((acc, order) => acc + order.fee, 0));

  return {
    initialCash: roundMoney(initialCash),
    finalCash: roundMoney(finalCash),
    finalMarketValue: roundMoney(finalMarketValue),
    finalTotalAssets,
    totalReturn,
    annualizedReturn,
    maxDrawdown: drawdown,
    annualizedVolatility,
    sharpeRatio,
    tradeCount: filled.length,
    winRate,
    averageWin,
    averageLoss,
    totalFees,
    tradingDays: dailyRecords.length,
    reasons,
  };
}
