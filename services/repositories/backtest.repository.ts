/**
 * 回测任务与结果存储。
 *
 * 一次回测的配置、每日记录与订单在同一个嵌套写入中落库，
 * 保证不会出现“有配置没结果”或“有结果没配置”的中间状态
 * （对应 PRD 14.3 数据一致性）。
 */

import type {
  BacktestDailyRecord,
  BacktestOrder,
  BacktestRun,
  BacktestRunEtf,
} from "@prisma/client";
import { prisma } from "@/services/prisma";
import type { BacktestConfig } from "@/services/backtest/types";
import type { RunBacktestResult } from "@/services/backtest/engine/engine";

export type BacktestRunStatus = "completed" | "failed";

export type SaveBacktestRunInput = {
  config: BacktestConfig;
  /** 策略参数快照。 */
  parameters: Record<string, unknown>;
  engineVersion: string;
  strategyVersionId?: string | null;
  /** 行情数据指纹，用于识别底层数据变化。 */
  dataFingerprint?: string | null;
  status?: BacktestRunStatus;
  /** 成功时的完整回测结果；失败时省略。 */
  result?: RunBacktestResult;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

export type StoredBacktestRun = {
  run: BacktestRun;
  etfs: BacktestRunEtf[];
  dailyRecords: BacktestDailyRecord[];
  orders: BacktestOrder[];
};

/** 序列化配置时剔除不可 JSON 化的字段（当前配置全为可序列化值）。 */
function serializeConfig(config: BacktestConfig): string {
  return JSON.stringify(config);
}

/**
 * 保存一次回测。返回 `BacktestRun.id`。
 */
export async function saveBacktestRun(input: SaveBacktestRunInput): Promise<string> {
  const {
    config,
    parameters,
    engineVersion,
    strategyVersionId = null,
    dataFingerprint = null,
    status = "completed",
    result,
    errorMessage = null,
    startedAt = null,
    finishedAt = null,
  } = input;

  if (status === "completed" && !result) {
    throw new Error("backtest.repository: status=completed 时必须提供 result");
  }

  const run = await prisma.backtestRun.create({
    data: {
      strategyVersionId,
      status,
      startDate: config.startDate,
      endDate: config.endDate,
      initialCash: config.initialCash,
      parametersJson: JSON.stringify(parameters),
      configJson: serializeConfig(config),
      engineVersion,
      dataFingerprint,
      startedAt,
      finishedAt,
      errorMessage,
      etfs: {
        create: config.codes.map((code, index) => ({ etfCode: code, priority: index })),
      },
      dailyRecords: result
        ? {
            create: result.dailyRecords.map((record) => ({
              date: record.date,
              cash: record.cash,
              marketValue: record.marketValue,
              totalAssets: record.totalAssets,
              realizedPnl: record.realizedPnl,
              unrealizedPnl: record.unrealizedPnl,
              fees: record.fees,
              dailyReturn: record.dailyReturn,
              drawdown: record.drawdown,
            })),
          }
        : undefined,
      orders: result
        ? {
            create: result.orders.map((order) => ({
              date: order.date,
              etfCode: order.code,
              side: order.side,
              requestedQuantity: order.requestedQuantity,
              executedQuantity: order.executedQuantity,
              price: order.price,
              amount: order.amount,
              fee: order.fee,
              status: order.status,
              reason: order.reason,
              strategyReason: order.strategyReason,
              realizedPnl: order.realizedPnl,
            })),
          }
        : undefined,
    },
    select: { id: true },
  });

  return run.id;
}

export async function getBacktestRun(id: string): Promise<StoredBacktestRun | null> {
  const run = await prisma.backtestRun.findUnique({
    where: { id },
    include: {
      etfs: { orderBy: { priority: "asc" } },
      dailyRecords: { orderBy: { date: "asc" } },
      orders: { orderBy: [{ date: "asc" }, { id: "asc" }] },
    },
  });

  if (!run) return null;

  const { etfs, dailyRecords, orders, ...rest } = run;
  return { run: rest, etfs, dailyRecords, orders };
}

export type ListBacktestRunsOptions = {
  limit?: number;
  status?: BacktestRunStatus;
};

export async function listBacktestRuns(
  options: ListBacktestRunsOptions = {},
): Promise<BacktestRun[]> {
  const { limit = 50, status } = options;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`backtest.repository: limit 必须是正整数，收到 ${limit}`);
  }

  return prisma.backtestRun.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** 删除一次回测及其关联记录（每日记录与订单级联删除）。 */
export async function deleteBacktestRun(id: string): Promise<void> {
  await prisma.backtestRun.delete({ where: { id } });
}
