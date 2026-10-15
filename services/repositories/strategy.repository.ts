/**
 * 策略与策略版本访问层。
 *
 * 策略版本不可变：修改策略只会新增版本，已有版本不会被覆盖
 * （对应 PRD 第 8 节）。
 */

import { createHash } from "node:crypto";
import type { Strategy, StrategyVersion } from "@prisma/client";
import { prisma } from "@/services/prisma";

export type StrategyRow = Strategy;
export type StrategyVersionRow = StrategyVersion;

/** 策略代码内容哈希，用于复现与去重。 */
export function hashSource(sourceCode: string): string {
  return createHash("sha256").update(sourceCode, "utf8").digest("hex");
}

export type CreateStrategyInput = {
  name: string;
  description?: string | null;
};

export async function createStrategy(input: CreateStrategyInput): Promise<StrategyRow> {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new TypeError("strategy.repository: name 不能为空");
  }

  return prisma.strategy.create({
    data: { name: input.name.trim(), description: input.description ?? null },
  });
}

export async function getStrategy(id: string): Promise<StrategyRow | null> {
  return prisma.strategy.findUnique({ where: { id } });
}

export async function listStrategies(includeArchived = false): Promise<StrategyRow[]> {
  return prisma.strategy.findMany({
    where: includeArchived ? undefined : { archivedAt: null },
    orderBy: { updatedAt: "desc" },
  });
}

export type CreateStrategyVersionInput = {
  strategyId: string;
  sourceCode: string;
  /** 参数 Schema（可选），同时用于编辑器提示与运行时校验。 */
  parameterSchema?: string | null;
  /** 策略 API 版本，用于兼容性判断。 */
  apiVersion?: string;
};

/**
 * 为策略追加一个新版本，版本号在策略内自增。
 */
export async function createStrategyVersion(
  input: CreateStrategyVersionInput,
): Promise<StrategyVersionRow> {
  if (typeof input.sourceCode !== "string" || input.sourceCode.trim() === "") {
    throw new TypeError("strategy.repository: sourceCode 不能为空");
  }

  return prisma.$transaction(async (tx) => {
    const latest = await tx.strategyVersion.findFirst({
      where: { strategyId: input.strategyId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    return tx.strategyVersion.create({
      data: {
        strategyId: input.strategyId,
        version: (latest?.version ?? 0) + 1,
        sourceCode: input.sourceCode,
        sourceHash: hashSource(input.sourceCode),
        parameterSchema: input.parameterSchema ?? null,
        apiVersion: input.apiVersion ?? "v1",
      },
    });
  });
}

export async function getStrategyVersion(id: string): Promise<StrategyVersionRow | null> {
  return prisma.strategyVersion.findUnique({ where: { id } });
}

export async function listStrategyVersions(strategyId: string): Promise<StrategyVersionRow[]> {
  return prisma.strategyVersion.findMany({
    where: { strategyId },
    orderBy: { version: "desc" },
  });
}

/**
 * 归档策略（PRD 第 8 节推荐方式）。
 */
export async function archiveStrategy(id: string, archivedAt: Date = new Date()): Promise<void> {
  await prisma.strategy.update({ where: { id }, data: { archivedAt } });
}

/**
 * 物理删除策略及其版本（级联）。
 *
 * 仅用于测试清理等场景；正常业务应使用 `archiveStrategy` 保留关联回测记录。
 */
export async function deleteStrategy(id: string): Promise<void> {
  await prisma.strategy.delete({ where: { id } });
}
