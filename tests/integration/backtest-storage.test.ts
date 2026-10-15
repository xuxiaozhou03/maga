import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/services/prisma";
import { ENGINE_VERSION, runBacktest } from "@/services/backtest/engine/engine";
import { buyAndHoldStrategy } from "@/services/strategy/examples/buy-and-hold";
import type { BacktestConfig, MarketSeries } from "@/services/backtest/types";
import {
  deleteBacktestRun,
  getBacktestRun,
  listBacktestRuns,
  saveBacktestRun,
} from "@/services/repositories/backtest.repository";
import {
  createStrategy,
  createStrategyVersion,
  deleteStrategy,
  listStrategyVersions,
} from "@/services/repositories/strategy.repository";

const DATES = [20240102, 20240103, 20240104, 20240105, 20240108];

function makeSeries(code: string, closes: readonly number[]): MarketSeries {
  return {
    code,
    bars: closes.map((close, index) => ({
      code,
      date: DATES[index],
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
      amount: close * 1000,
    })),
  };
}

const config: BacktestConfig = {
  initialCash: 10_000,
  startDate: DATES[0],
  endDate: DATES[DATES.length - 1],
  codes: ["TEST.SH"],
  fee: { commissionRate: 0, minCommission: 0, stampDutyRate: 0, transferFeeRate: 0 },
  trading: { lotSize: 100 },
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe("策略与版本存储", () => {
  it("版本号自增、哈希随源码变化", async () => {
    const strategy = await createStrategy({ name: `测试策略-${Date.now()}`, description: "单测用" });

    try {
      const first = await createStrategyVersion({
        strategyId: strategy.id,
        sourceCode: "export const a = 1;",
      });
      const second = await createStrategyVersion({
        strategyId: strategy.id,
        sourceCode: "export const a = 2;",
      });

      expect(first.version).toBe(1);
      expect(second.version).toBe(2);
      expect(first.sourceHash).toHaveLength(64);
      expect(first.sourceHash).not.toBe(second.sourceHash);
      expect(first.apiVersion).toBe("v1");

      const versions = await listStrategyVersions(strategy.id);
      expect(versions.map((item) => item.version)).toEqual([2, 1]);
    } finally {
      await deleteStrategy(strategy.id);
    }
  });

  it("拒绝空策略名与空源码", async () => {
    await expect(createStrategy({ name: "   " })).rejects.toThrow(TypeError);

    const strategy = await createStrategy({ name: `测试策略-${Date.now()}-b` });
    try {
      await expect(
        createStrategyVersion({ strategyId: strategy.id, sourceCode: "  " }),
      ).rejects.toThrow(TypeError);
    } finally {
      await deleteStrategy(strategy.id);
    }
  });
});

describe("回测结果存储", () => {
  it("保存、读取、列出并删除一次回测", async () => {
    const strategy = await createStrategy({ name: `回测策略-${Date.now()}` });
    const version = await createStrategyVersion({
      strategyId: strategy.id,
      sourceCode: "export const run = () => {};",
    });

    const result = runBacktest({
      strategy: buyAndHoldStrategy,
      config,
      series: [makeSeries("TEST.SH", [10, 11, 12, 11, 10])],
    });

    let runId: string | null = null;
    try {
      runId = await saveBacktestRun({
        config,
        parameters: { code: "TEST.SH" },
        engineVersion: ENGINE_VERSION,
        strategyVersionId: version.id,
        dataFingerprint: "fingerprint-demo",
        result,
        startedAt: new Date(),
        finishedAt: new Date(),
      });

      const stored = await getBacktestRun(runId);
      expect(stored).not.toBeNull();
      expect(stored?.run.status).toBe("completed");
      expect(stored?.run.strategyVersionId).toBe(version.id);
      expect(stored?.run.dataFingerprint).toBe("fingerprint-demo");
      expect(stored?.etfs.map((item) => item.etfCode)).toEqual(config.codes);
      expect(stored?.dailyRecords).toHaveLength(result.dailyRecords.length);
      expect(stored?.orders).toHaveLength(result.orders.length);
      expect(JSON.parse(stored?.run.configJson as string).initialCash).toBe(10_000);
      expect(JSON.parse(stored?.run.parametersJson as string).code).toBe("TEST.SH");

      const listed = await listBacktestRuns({ limit: 10 });
      expect(listed.some((run) => run.id === runId)).toBe(true);
    } finally {
      if (runId) await deleteBacktestRun(runId);
      await deleteStrategy(strategy.id);
    }

    expect(runId).not.toBeNull();
    expect(await getBacktestRun(runId as string)).toBeNull();
  });

  it("失败的回测只保留状态与错误信息", async () => {
    let runId: string | null = null;
    try {
      runId = await saveBacktestRun({
        config,
        parameters: {},
        engineVersion: ENGINE_VERSION,
        status: "failed",
        errorMessage: "策略执行超时",
      });

      const stored = await getBacktestRun(runId);
      expect(stored?.run.status).toBe("failed");
      expect(stored?.run.errorMessage).toBe("策略执行超时");
      expect(stored?.dailyRecords).toHaveLength(0);
      expect(stored?.orders).toHaveLength(0);
    } finally {
      if (runId) await deleteBacktestRun(runId);
    }
  });

  it("completed 状态必须携带 result", async () => {
    await expect(
      saveBacktestRun({
        config,
        parameters: {},
        engineVersion: ENGINE_VERSION,
        status: "completed",
      }),
    ).rejects.toThrow(Error);
  });
});
