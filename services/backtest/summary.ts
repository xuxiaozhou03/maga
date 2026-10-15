/**
 * 把落库的每日记录与订单还原成引擎类型，并重算指标。
 *
 * 指标不单独存表：从明细重算可以避免“结果表与明细不一致”。
 */

import type { BacktestDailyRecord, BacktestOrder } from "@prisma/client";
import { computeMetrics } from "./metrics/metrics";
import type {
  BacktestMetrics,
  DailyRecord,
  OrderRecord,
  OrderSide,
  OrderStatus,
  RejectReason,
} from "./types";

export type StoredRunDetail = {
  initialCash: number;
  dailyRecords: readonly BacktestDailyRecord[];
  orders: readonly BacktestOrder[];
};

export type BacktestSummary = {
  dailyRecords: DailyRecord[];
  orders: OrderRecord[];
  metrics: BacktestMetrics;
};

export function summarizeStoredRun(run: StoredRunDetail): BacktestSummary {
  const dailyRecords: DailyRecord[] = run.dailyRecords.map((record) => ({
    date: record.date,
    cash: record.cash,
    marketValue: record.marketValue,
    totalAssets: record.totalAssets,
    realizedPnl: record.realizedPnl,
    unrealizedPnl: record.unrealizedPnl,
    fees: record.fees,
    dailyReturn: record.dailyReturn,
    drawdown: record.drawdown,
    positions: [],
  }));

  const orders: OrderRecord[] = run.orders.map((order) => ({
    date: order.date,
    code: order.etfCode,
    side: order.side as OrderSide,
    requestedQuantity: order.requestedQuantity,
    executedQuantity: order.executedQuantity,
    price: order.price,
    amount: order.amount,
    fee: order.fee,
    status: order.status as OrderStatus,
    reason: (order.reason as RejectReason | null) ?? null,
    strategyReason: order.strategyReason,
    realizedPnl: order.realizedPnl,
  }));

  // 期末现金与市值取最后一条每日记录；没有记录时退回初始资金。
  const last = dailyRecords[dailyRecords.length - 1];

  const metrics = computeMetrics({
    initialCash: run.initialCash,
    dailyRecords,
    orders,
    finalCash: last?.cash ?? run.initialCash,
    finalMarketValue: last?.marketValue ?? 0,
    riskFreeRate: 0,
  });

  return { dailyRecords, orders, metrics };
}
