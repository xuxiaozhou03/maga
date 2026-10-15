/**
 * 回测任务接口。
 *
 * POST：用仓库中已注册的策略跑一次回测，落库并返回指标摘要。
 * GET ：列出最近的回测任务。
 *
 * 策略由 `services/strategy` 注册表提供，在 Next.js 服务端进程内执行；
 * 账务、订单与费用全部由统一回测引擎负责。
 */

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isValidYmd, type Ymd } from "@/lib/dates";
import { ENGINE_VERSION } from "@/services/backtest/engine/engine";
import { runBacktestOnDatabase } from "@/services/backtest/engine/data";
import {
  DEFAULT_ETF_FEE,
  DEFAULT_ETF_TRADING,
  type BacktestConfig,
} from "@/services/backtest/types";
import { getRegisteredStrategy } from "@/services/strategy";
import { listEtfCodes } from "@/services/repositories/etf.repository";
import { getKlineFingerprint } from "@/services/repositories/kline.repository";
import { listBacktestRuns, saveBacktestRun } from "@/services/repositories/backtest.repository";

const DEFAULT_WARMUP_BARS = 60;

type RunRequest = {
  strategyId: string;
  codes: string[];
  startDate: Ymd;
  endDate: Ymd;
  initialCash: number;
  params: Record<string, unknown>;
  warmupBars: number;
  liquidateAtEnd: boolean;
};

type ParseOutcome =
  | { ok: true; value: RunRequest }
  | { ok: false; issues: string[] };

function parseBody(body: unknown, knownCodes: ReadonlySet<string>): ParseOutcome {
  const issues: string[] = [];

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, issues: ["请求体必须是 JSON 对象"] };
  }
  const raw = body as Record<string, unknown>;

  const strategyId = raw.strategyId;
  if (typeof strategyId !== "string" || strategyId.trim() === "") {
    issues.push("strategyId 必须是非空字符串");
  }

  let codes: string[] = [];
  if (!Array.isArray(raw.codes) || raw.codes.length === 0) {
    issues.push("codes 必须是非空数组");
  } else if (!raw.codes.every((item) => typeof item === "string" && item.trim() !== "")) {
    issues.push("codes 必须是字符串数组");
  } else {
    codes = raw.codes as string[];
    const unknown = codes.filter((code) => !knownCodes.has(code));
    if (unknown.length > 0) issues.push(`未知的 ETF 代码：${unknown.join(", ")}`);
  }

  const startDate = raw.startDate;
  const endDate = raw.endDate;
  if (!isValidYmd(startDate)) issues.push("startDate 必须是 YYYYMMDD 整数");
  if (!isValidYmd(endDate)) issues.push("endDate 必须是 YYYYMMDD 整数");
  if (isValidYmd(startDate) && isValidYmd(endDate) && startDate > endDate) {
    issues.push("startDate 不能晚于 endDate");
  }

  const initialCash = raw.initialCash;
  if (typeof initialCash !== "number" || !Number.isFinite(initialCash) || initialCash <= 0) {
    issues.push("initialCash 必须是正数");
  }

  let params: Record<string, unknown> = {};
  if (raw.params !== undefined) {
    if (typeof raw.params !== "object" || raw.params === null || Array.isArray(raw.params)) {
      issues.push("params 必须是 JSON 对象");
    } else {
      params = raw.params as Record<string, unknown>;
    }
  }

  const warmupBars = raw.warmupBars ?? DEFAULT_WARMUP_BARS;
  if (!Number.isInteger(warmupBars) || (warmupBars as number) < 0) {
    issues.push("warmupBars 必须是非负整数");
  }

  const liquidateAtEnd = raw.liquidateAtEnd ?? false;
  if (typeof liquidateAtEnd !== "boolean") issues.push("liquidateAtEnd 必须是布尔值");

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      strategyId: strategyId as string,
      codes,
      startDate: startDate as Ymd,
      endDate: endDate as Ymd,
      initialCash: initialCash as number,
      params,
      warmupBars: warmupBars as number,
      liquidateAtEnd: liquidateAtEnd as boolean,
    },
  };
}

/** 把各标的的区间指纹合并成一个回测级指纹。 */
async function fingerprintOf(
  codes: readonly string[],
  startDate: Ymd,
  endDate: Ymd,
): Promise<string> {
  const parts = await Promise.all(
    codes.map(async (code) => {
      const fingerprint = await getKlineFingerprint({ code, startDate, endDate });
      return `${code}:${fingerprint}`;
    }),
  );
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export const POST = async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const parsed = parseBody(body, new Set(await listEtfCodes()));
  if (!parsed.ok) {
    return NextResponse.json({ error: "参数校验失败", issues: parsed.issues }, { status: 400 });
  }

  const { strategyId, codes, startDate, endDate, initialCash, params, warmupBars, liquidateAtEnd } =
    parsed.value;

  const registered = getRegisteredStrategy(strategyId);
  if (!registered) {
    return NextResponse.json({ error: `未知策略：${strategyId}` }, { status: 404 });
  }

  const config: BacktestConfig = {
    initialCash,
    startDate,
    endDate,
    codes,
    fee: DEFAULT_ETF_FEE,
    trading: DEFAULT_ETF_TRADING,
    liquidateAtEnd,
  };

  const mergedParams = { ...(registered.strategy.params ?? {}), ...params };
  const runnable = { ...registered.strategy, params: mergedParams };

  const startedAt = new Date();

  try {
    const [result, dataFingerprint] = await Promise.all([
      runBacktestOnDatabase(runnable, config, warmupBars),
      fingerprintOf(codes, startDate, endDate),
    ]);

    const runId = await saveBacktestRun({
      config,
      parameters: mergedParams,
      engineVersion: ENGINE_VERSION,
      dataFingerprint,
      status: "completed",
      result,
      startedAt,
      finishedAt: new Date(),
    });

    return NextResponse.json({
      runId,
      strategyId,
      dataFingerprint,
      metrics: result.metrics,
      tradingDays: result.dailyRecords.length,
      orderCount: result.orders.length,
      rejectedOrderCount: result.orders.filter((order) => order.status === "rejected").length,
      logCount: result.logs.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // 失败也留痕，便于事后排查。
    await saveBacktestRun({
      config,
      parameters: mergedParams,
      engineVersion: ENGINE_VERSION,
      status: "failed",
      errorMessage: message,
      startedAt,
      finishedAt: new Date(),
    }).catch(() => undefined);

    return NextResponse.json({ error: `回测执行失败：${message}` }, { status: 500 });
  }
};

export const GET = async () => {
  const runs = await listBacktestRuns({ limit: 20 });
  return NextResponse.json({
    runs: runs.map((run) => ({
      id: run.id,
      status: run.status,
      startDate: run.startDate,
      endDate: run.endDate,
      initialCash: run.initialCash,
      engineVersion: run.engineVersion,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt,
    })),
  });
};
