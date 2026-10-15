/**
 * 单次回测详情。
 *
 * 指标不单独落库，而是从存下来的每日记录与订单重算，避免结果表与明细不一致。
 */

import { NextResponse } from "next/server";
import { computeMetrics } from "@/services/backtest/metrics/metrics";
import type {
  DailyRecord,
  OrderRecord,
  OrderSide,
  OrderStatus,
  RejectReason,
} from "@/services/backtest/types";
import { getBacktestRun } from "@/services/repositories/backtest.repository";

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const GET = async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const { id } = await context.params;
  const stored = await getBacktestRun(id);

  if (!stored) {
    return NextResponse.json({ error: `回测不存在：${id}` }, { status: 404 });
  }

  const { run, etfs, dailyRecords: storedDaily, orders: storedOrders } = stored;

  const dailyRecords: DailyRecord[] = storedDaily.map((record) => ({
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

  const orders: OrderRecord[] = storedOrders.map((order) => ({
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
  const finalCash = last?.cash ?? run.initialCash;
  const finalMarketValue = last?.marketValue ?? 0;

  const metrics = computeMetrics({
    initialCash: run.initialCash,
    dailyRecords,
    orders,
    finalCash,
    finalMarketValue,
    riskFreeRate: 0,
  });

  return NextResponse.json({
    run: {
      id: run.id,
      strategyId: run.strategyId,
      strategyVersionId: run.strategyVersionId,
      status: run.status,
      startDate: run.startDate,
      endDate: run.endDate,
      initialCash: run.initialCash,
      engineVersion: run.engineVersion,
      dataFingerprint: run.dataFingerprint,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt,
    },
    config: safeParse(run.configJson, null),
    parameters: safeParse(run.parametersJson, {}),
    etfs: etfs.map((item) => ({ code: item.etfCode, priority: item.priority })),
    metrics,
    dailyRecords,
    orders,
  });
};
