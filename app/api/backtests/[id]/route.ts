/**
 * 单次回测详情。
 *
 * 指标从存下来的每日记录与订单重算，不单独存表（见 services/backtest/summary.ts）。
 */

import { NextResponse } from "next/server";
import { summarizeStoredRun } from "@/services/backtest/summary";
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
  const { dailyRecords, orders, metrics } = summarizeStoredRun({
    initialCash: run.initialCash,
    dailyRecords: storedDaily,
    orders: storedOrders,
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
