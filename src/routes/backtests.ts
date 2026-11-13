import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { prisma } from "../db.js";
import { runBacktest } from "../engine/engine.js";
import {
  getLatestProgress,
  progressBus,
  type ProgressPayload,
} from "../engine/progress.js";

export const backtestsRoute = new Hono();

type RunStatusRow = {
  status: string;
  totalReturn: number | null;
  error: string | null;
};

function terminalPayload(run: RunStatusRow): ProgressPayload | null {
  if (run.status === "success") {
    return {
      type: "done",
      status: "success",
      totalReturn: run.totalReturn,
    };
  }
  if (run.status === "failed") {
    return { type: "error", message: run.error ?? "回测失败" };
  }
  return null;
}

backtestsRoute.post("/", async (context) => {
  const body = await context.req.json<{
    strategyKey?: string;
    params?: Record<string, unknown>;
    codes?: string[];
    startDate?: number;
    endDate?: number;
    config?: Record<string, number>;
    initialCash?: number;
  }>();

  if (!body?.strategyKey) {
    return context.json({ error: "strategyKey required" }, 400);
  }
  if (!Array.isArray(body.codes) || !body.codes.length) {
    return context.json({ error: "codes required" }, 400);
  }
  if (
    !body.startDate ||
    !body.endDate ||
    body.startDate > body.endDate
  ) {
    return context.json({ error: "invalid date range" }, 400);
  }

  const run = await prisma.backtestRun.create({
    data: {
      strategyKey: body.strategyKey,
      params: JSON.stringify({
        params: body.params ?? {},
        config: body.config ?? {},
      }),
      codes: JSON.stringify(body.codes),
      startDate: body.startDate,
      endDate: body.endDate,
      status: "running",
    },
  });

  setTimeout(() => {
    void runBacktest({
      strategyKey: body.strategyKey!,
      params: body.params ?? {},
      codes: body.codes!,
      startDate: body.startDate!,
      endDate: body.endDate!,
      config: body.config,
      initialCash: body.initialCash,
      runId: run.id,
    });
  }, 0);

  return context.json({ id: run.id, status: "running" });
});

backtestsRoute.get("/:id/stream", async (context) => {
  const id = context.req.param("id");
  const run = await prisma.backtestRun.findUnique({ where: { id } });
  if (!run) return context.notFound();

  return streamSSE(context, async (stream) => {
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let resolveFinished: (() => void) | undefined;
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });

    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat);
      progressBus.off(`run:${id}`, handler);
    };

    const closeStream = async (payload: ProgressPayload) => {
      if (closed) return;
      closed = true;
      cleanup();
      try {
        await stream.writeSSE({
          event: payload.type,
          data: JSON.stringify(payload),
        });
        await stream.close();
      } finally {
        resolveFinished?.();
      }
    };

    const handler = (payload: ProgressPayload) => {
      if (closed) return;
      if (payload.type === "done" || payload.type === "error") {
        void closeStream(payload);
        return;
      }
      void stream
        .writeSSE({
          event: payload.type,
          data: JSON.stringify(payload),
        })
        .catch(() => {
          closed = true;
          cleanup();
          resolveFinished?.();
        });
    };

    progressBus.on(`run:${id}`, handler);
    stream.onAbort(() => {
      if (closed) return;
      closed = true;
      cleanup();
      resolveFinished?.();
    });

    const latest = getLatestProgress(id);
    const current = await prisma.backtestRun.findUnique({
      where: { id },
      select: { status: true, totalReturn: true, error: true },
    });
    const terminal = current ? terminalPayload(current) : null;
    if (terminal) {
      await closeStream(terminal);
    } else if (latest?.type === "progress") {
      await stream.writeSSE({
        event: "progress",
        data: JSON.stringify(latest),
      });
    }

    if (!closed) {
      heartbeat = setInterval(() => {
        void stream
          .writeSSE({ event: "ping", data: "" })
          .catch(() => {
            closed = true;
            cleanup();
            resolveFinished?.();
          });
      }, 15_000);
    }

    await finished;
  });
});

backtestsRoute.get("/", async (context) => {
  const limit = Math.max(
    1,
    Math.min(Number(context.req.query("limit") ?? 20) || 20, 200),
  );
  const offset = Math.max(0, Number(context.req.query("offset") ?? 0) || 0);
  const strategyKey = context.req.query("strategyKey");
  const code = context.req.query("code");
  const where: {
    strategyKey?: string;
    codes?: { contains: string };
  } = {};
  if (strategyKey) where.strategyKey = strategyKey;
  if (code) where.codes = { contains: code };

  const [rows, total] = await Promise.all([
    prisma.backtestRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        strategyKey: true,
        codes: true,
        startDate: true,
        endDate: true,
        status: true,
        totalReturn: true,
        annualReturn: true,
        maxDrawdown: true,
        sharpe: true,
        winRate: true,
        tradeCount: true,
        createdAt: true,
      },
    }),
    prisma.backtestRun.count({ where }),
  ]);
  return context.json({ total, rows });
});

backtestsRoute.get("/:id", async (context) => {
  const run = await prisma.backtestRun.findUnique({
    where: { id: context.req.param("id") },
  });
  return run ? context.json(run) : context.notFound();
});

backtestsRoute.get("/:id/daily", async (context) => {
  const rows = await prisma.backtestDaily.findMany({
    where: { runId: context.req.param("id") },
    orderBy: { date: "asc" },
  });
  return context.json(
    rows.map((row) => {
      let positions: Record<string, number> = {};
      try {
        positions = JSON.parse(row.positions);
      } catch {
        positions = {};
      }
      return { ...row, positions };
    }),
  );
});

backtestsRoute.get("/:id/trades", async (context) => {
  const trade = await prisma.backtestTrade.findUnique({
    where: { runId: context.req.param("id") },
  });
  if (!trade) return context.json([]);
  try {
    return context.json(JSON.parse(trade.trades));
  } catch {
    return context.json([]);
  }
});
