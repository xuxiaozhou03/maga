import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/services/prisma";
import { GET as listStrategiesRoute } from "@/app/api/strategies/route";
import { GET as listRunsRoute, POST as runBacktestRoute } from "@/app/api/backtests/route";
import { deleteBacktestRun } from "@/services/repositories/backtest.repository";

function postJson(body: unknown): Request {
  return new Request("http://localhost/api/backtests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID = {
  strategyId: "buy-and-hold",
  codes: ["510300.SH"],
  startDate: 20240102,
  endDate: 20241231,
  initialCash: 100_000,
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/strategies", () => {
  it("列出仓库中已注册的策略", async () => {
    const response = await listStrategiesRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    const ids = body.strategies.map((item: { id: string }) => item.id);
    expect(ids).toContain("buy-and-hold");
    expect(ids).toContain("moving-average-cross");
  });
});

describe("POST /api/backtests", () => {
  it("用仓库策略在 Next.js 里跑通一次回测并落库", async () => {
    const response = await runBacktestRoute(postJson(VALID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.runId).toBeTruthy();
    expect(body.metrics.finalTotalAssets).toBeGreaterThan(0);
    expect(body.metrics.totalFees).toBeGreaterThan(0);
    expect(body.tradingDays).toBeGreaterThan(200);
    expect(body.orderCount).toBeGreaterThan(0);
    expect(body.rejectedOrderCount).toBe(0);
    expect(body.dataFingerprint).toMatch(/^[0-9a-f]{64}$/);

    const stored = await prisma.backtestRun.findUnique({ where: { id: body.runId } });
    expect(stored?.status).toBe("completed");

    await deleteBacktestRun(body.runId);
  });

  it("支持传入策略参数", async () => {
    const response = await runBacktestRoute(
      postJson({
        ...VALID,
        strategyId: "moving-average-cross",
        params: { fast: 5, slow: 20 },
        startDate: 20240102,
        endDate: 20241231,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.orderCount).toBeGreaterThan(0);
    await deleteBacktestRun(body.runId);
  });

  it("未知策略返回 404", async () => {
    const response = await runBacktestRoute(postJson({ ...VALID, strategyId: "not-exist" }));
    expect(response.status).toBe(404);
  });

  it("非法参数返回 400 并说明原因", async () => {
    const response = await runBacktestRoute(
      postJson({ ...VALID, initialCash: -1, startDate: 20240132 }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.issues.join(" ")).toContain("initialCash");
    expect(body.issues.join(" ")).toContain("startDate");
  });

  it("未知 ETF 代码返回 400", async () => {
    const response = await runBacktestRoute(postJson({ ...VALID, codes: ["999999.XX"] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.issues.join(" ")).toContain("999999.XX");
  });

  it("请求体不是 JSON 时返回 400", async () => {
    const response = await runBacktestRoute(
      new Request("http://localhost/api/backtests", { method: "POST", body: "not json" }),
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/backtests", () => {
  it("返回最近的回测任务", async () => {
    const response = await listRunsRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.runs)).toBe(true);
  });
});
