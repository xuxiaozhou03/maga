import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestServer,
  makeKlineRows,
  makeNoopKlineSource,
  makeStaticKlineSource,
  type TestServer,
} from "../support/server.js";
import { SNAPSHOT_ANALYSIS_DATE } from "../support/snapshots.js";

interface ApiBody {
  ok: boolean;
  data: Record<string, unknown> & {
    items?: Array<Record<string, unknown>>;
    total?: number;
    filteredTotal?: number;
    page?: number;
    pageSize?: number;
    code?: string;
    rows?: Array<Record<string, unknown>>;
    taskId?: string;
  };
  meta?: Record<string, unknown>;
  error?: { code: string; message: string; details: Record<string, unknown> };
}

async function json(response: Response): Promise<ApiBody> {
  return (await response.json()) as ApiBody;
}

describe("read-only JSON API", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({ klineSource: makeNoopKlineSource() });
  });

  afterAll(async () => {
    await server.cleanup();
  });

  it("reports health and current snapshot without touching upstream sources", async () => {
    const response = await server.app.request("/api/health");
    const body = await json(response);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.current).toMatchObject({
      analysisDate: SNAPSHOT_ANALYSIS_DATE,
      snapshotVersion: 1,
    });
  });

  it("returns market overview and analysis from the resolved snapshot", async () => {
    const overviewResponse = await server.app.request("/api/market/overview");
    const overview = await json(overviewResponse);
    expect(overviewResponse.status).toBe(200);
    expect(overview.meta).toMatchObject({
      analysisDate: SNAPSHOT_ANALYSIS_DATE,
      snapshotVersion: 1,
      dataStatus: "complete",
    });
    expect(overview.data).toHaveProperty("state");

    const analysisResponse = await server.app.request("/api/market/analysis");
    const analysis = await json(analysisResponse);
    expect(analysisResponse.status).toBe(200);
    expect(analysis.data).toHaveProperty("returns");
    expect(analysis.data).toHaveProperty("risk");
    expect(analysis.data).toHaveProperty("findings");
  });

  it("filters, searches, paginates and preserves full-pool and filtered ranks", async () => {
    const allResponse = await server.app.request("/api/etfs");
    const all = await json(allResponse);
    expect(allResponse.status).toBe(200);
    expect(all.data.total).toBe(5);
    expect(all.data.filteredTotal).toBe(5);

    const pendingResponse = await server.app.request("/api/etfs?category=pending&pageSize=10");
    const pending = await json(pendingResponse);
    expect(pending.data.total).toBe(5);
    expect(pending.data.filteredTotal).toBe(5);
    for (const item of pending.data.items ?? []) {
      expect(item.category).toMatchObject({ status: "pending" });
      const ranks = item.ranks as Record<string, { rank: number; filteredRank?: number }>;
      expect(ranks.return_20d?.rank).toBeTypeOf("number");
      expect(ranks.return_20d?.filteredRank).toBeTypeOf("number");
    }

    const searchResponse = await server.app.request("/api/etfs?q=510300");
    const search = await json(searchResponse);
    expect(search.data.filteredTotal).toBe(1);
    expect(search.data.items?.[0]).toMatchObject({ code: "510300.SH" });

    const pageResponse = await server.app.request("/api/etfs?pageSize=2&page=2");
    const page = await json(pageResponse);
    expect(page.data.page).toBe(2);
    expect(page.data.pageSize).toBe(2);
    expect(page.data.items).toHaveLength(2);

    const confirmedResponse = await server.app.request("/api/etfs?category=confirmed&pageSize=10");
    const confirmed = await json(confirmedResponse);
    expect(confirmed.data.filteredTotal).toBe(0);
  });

  it("does not leak filtered ranks into cached unfiltered reads", async () => {
    await server.app.request("/api/etfs?category=pending&pageSize=10");
    const response = await server.app.request("/api/etfs?pageSize=10");
    const body = await json(response);
    for (const item of body.data.items ?? []) {
      const ranks = item.ranks as Record<string, { filteredRank?: number }>;
      expect(ranks.return_20d?.filteredRank).toBeUndefined();
    }
  });

  it("validates query parameters and missing snapshots", async () => {
    const invalidDate = await server.app.request("/api/etfs?date=2026-99-99");
    expect(invalidDate.status).toBe(400);
    expect((await json(invalidDate)).error?.code).toBe("INVALID_QUERY");

    const invalidCategory = await server.app.request("/api/etfs?category=not-a-category");
    expect(invalidCategory.status).toBe(400);
    expect((await json(invalidCategory)).error?.code).toBe("INVALID_QUERY");

    const invalidSubcategory = await server.app.request(
      "/api/etfs?category=pending&subcategory=not-a-subcategory",
    );
    expect(invalidSubcategory.status).toBe(400);
    expect((await json(invalidSubcategory)).error?.code).toBe("INVALID_QUERY");

    const missingSnapshot = await server.app.request("/api/etfs?date=2026-11-14");
    expect(missingSnapshot.status).toBe(404);
    expect((await json(missingSnapshot)).error?.code).toBe("SNAPSHOT_NOT_FOUND");
  });

  it("returns ETF detail and history, and maps unknown ETFs to 404", async () => {
    const detailResponse = await server.app.request("/api/etfs/510300.SH");
    const detail = await json(detailResponse);
    expect(detailResponse.status).toBe(200);
    expect(detail.data).toMatchObject({ code: "510300.SH", analysisDate: SNAPSHOT_ANALYSIS_DATE });
    expect(detail.data).toHaveProperty("ranks");

    const missingResponse = await server.app.request("/api/etfs/999999.SH");
    expect(missingResponse.status).toBe(404);
    expect((await json(missingResponse)).error?.code).toBe("ETF_NOT_FOUND");

    const historyResponse = await server.app.request(
      `/api/etfs/510300.SH/history?date=${SNAPSHOT_ANALYSIS_DATE}&range=1y`,
    );
    const history = await json(historyResponse);
    expect(historyResponse.status).toBe(200);
    expect(history.data.total).toBe(1);
    expect(history.data.items?.[0]).toMatchObject({
      analysisDate: SNAPSHOT_ANALYSIS_DATE,
      snapshotVersion: 1,
    });
  });

  it("returns both full-pool and filtered ranking scopes", async () => {
    const fullResponse = await server.app.request("/api/rankings?ranking=return_20d");
    const full = await json(fullResponse);
    expect(fullResponse.status).toBe(200);
    expect(full.data).toMatchObject({ scope: "full", rankingCode: "return_20d" });

    const filteredResponse = await server.app.request(
      "/api/rankings?ranking=return_20d&category=pending&pageSize=10",
    );
    const filtered = await json(filteredResponse);
    expect(filteredResponse.status).toBe(200);
    expect(filtered.data).toMatchObject({ scope: "filtered", rankingCode: "return_20d" });
    expect(filtered.data).toHaveProperty("fullPool");
    const items = filtered.data.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(5);
    expect(items.every((item) => item.fullPoolRank !== null)).toBe(true);
  });

  it("filters an explicitly confirmed category without blocking pending ETFs", async () => {
    const confirmedServer = await createTestServer({
      confirmFirstEtf: true,
      klineSource: makeNoopKlineSource(),
    });
    try {
      const confirmedResponse = await confirmedServer.app.request(
        "/api/etfs?category=confirmed&pageSize=10",
      );
      const confirmed = await json(confirmedResponse);
      expect(confirmedResponse.status).toBe(200);
      expect(confirmed.data.filteredTotal).toBe(1);
      expect(confirmed.data.items?.[0]).toMatchObject({
        code: "510300.SH",
        category: { status: "confirmed" },
      });
    } finally {
      await confirmedServer.cleanup();
    }
  });

  it("returns findings, reports, snapshots and tasks", async () => {
    const findingsResponse = await server.app.request("/api/findings");
    expect(findingsResponse.status).toBe(200);
    expect((await json(findingsResponse)).data).toMatchObject({ total: 0, items: [] });

    const reportsResponse = await server.app.request("/api/reports");
    expect(reportsResponse.status).toBe(200);
    expect((await json(reportsResponse)).data).toMatchObject({ total: 0, items: [] });

    const reportResponse = await server.app.request("/api/reports/missing");
    expect(reportResponse.status).toBe(400);
    expect((await json(reportResponse)).error?.code).toBe("INVALID_QUERY");

    const snapshotsResponse = await server.app.request("/api/snapshots");
    const snapshots = await json(snapshotsResponse);
    expect(snapshotsResponse.status).toBe(200);
    expect(snapshots.data.items).toHaveLength(1);

    const versionResponse = await server.app.request(`/api/snapshots/${SNAPSHOT_ANALYSIS_DATE}/1`);
    expect(versionResponse.status).toBe(200);
    expect((await json(versionResponse)).data).toMatchObject({
      analysisDate: SNAPSHOT_ANALYSIS_DATE,
      snapshotVersion: 1,
    });

    const tasksResponse = await server.app.request("/api/tasks");
    const tasks = await json(tasksResponse);
    expect(tasksResponse.status).toBe(200);
    expect(tasks.data.total).toBeGreaterThanOrEqual(1);
    const taskId = (tasks.data.items?.[0] as { taskId?: string } | undefined)?.taskId;
    expect(taskId).toBeTruthy();
    const taskResponse = await server.app.request(`/api/tasks/${taskId}`);
    expect(taskResponse.status).toBe(200);

    const invalidTask = await server.app.request("/api/tasks/not-a-task");
    expect(invalidTask.status).toBe(400);
    const missingTask = await server.app.request("/api/tasks/task_missing");
    expect(missingTask.status).toBe(404);
    expect((await json(missingTask)).error?.code).toBe("TASK_NOT_FOUND");
  });

  it("serves local chart assets without a CDN", async () => {
    const scriptResponse = await server.app.request("/assets/app.js");
    expect(scriptResponse.status).toBe(200);
    expect(scriptResponse.headers.get("content-type")).toContain("javascript");
    expect(await scriptResponse.text()).toContain("loadKline");

    const echartsResponse = await server.app.request("/assets/echarts.min.js");
    expect(echartsResponse.status).toBe(200);
    expect(await echartsResponse.text()).toContain("echarts");
  });
});

describe("Kline API", () => {
  it("loads a missing cache once and validates period and ETF code", async () => {
    const staticSource = makeStaticKlineSource(makeKlineRows("510300.SH"));
    const server = await createTestServer({ klineSource: staticSource.source });
    try {
      const response = await server.app.request(
        `/api/etfs/510300.SH/kline?date=${SNAPSHOT_ANALYSIS_DATE}&period=day&limit=100`,
      );
      const body = await json(response);
      expect(response.status).toBe(200);
      expect(body.data.rows).toHaveLength(2);
      expect(body.data).toMatchObject({ adjust: 1, period: "day" });
      expect(staticSource.calls()).toBe(1);

      const cachedResponse = await server.app.request(
        `/api/etfs/510300.SH/kline?date=${SNAPSHOT_ANALYSIS_DATE}&period=week`,
      );
      expect(cachedResponse.status).toBe(200);
      expect(staticSource.calls()).toBe(1);

      await server.services.klineCache.write(
        "510300.SH",
        [
          {
            code: "510300.SH",
            date: "2026-11-10",
            open: 0.9,
            high: 1,
            low: 0.8,
            close: 0.95,
            volume: 500,
            amount: 500_000,
            change: 0.05,
            changePercent: 0.05,
          },
        ],
        { analysisDate: SNAPSHOT_ANALYSIS_DATE, updatedAt: "2026-11-11T08:00:00.000Z" },
      );
      const staleResponse = await server.app.request(
        `/api/etfs/510300.SH/kline?date=${SNAPSHOT_ANALYSIS_DATE}&period=day`,
      );
      expect(staleResponse.status).toBe(200);
      expect(staticSource.calls()).toBe(2);

      const invalidPeriod = await server.app.request("/api/etfs/510300.SH/kline?period=quarter");
      expect(invalidPeriod.status).toBe(400);

      const missingEtf = await server.app.request("/api/etfs/999999.SH/kline");
      expect(missingEtf.status).toBe(404);
      expect((await json(missingEtf)).error?.code).toBe("ETF_NOT_FOUND");
      expect(staticSource.calls()).toBe(2);
    } finally {
      await server.cleanup();
    }
  });
});

describe("corrupt and empty snapshots", () => {
  it("returns SNAPSHOT_CORRUPT without exposing a stack", async () => {
    const server = await createTestServer({ klineSource: null });
    try {
      const rankingFile = join(
        server.root.root,
        "snapshots",
        SNAPSHOT_ANALYSIS_DATE,
        "v1",
        "rankings",
        "return_1d.json",
      );
      await appendFile(rankingFile, " ", "utf8");
      const response = await server.app.request("/api/etfs");
      const body = await json(response);
      expect(response.status).toBe(500);
      expect(body.error?.code).toBe("SNAPSHOT_CORRUPT");
      expect(JSON.stringify(body)).not.toContain("stack");
      expect(JSON.stringify(body)).not.toContain(server.root.root);
    } finally {
      await server.cleanup();
    }
  });

  it("returns SNAPSHOT_NOT_FOUND when nothing has been published", async () => {
    const server = await createTestServer({ publish: false, klineSource: null });
    try {
      const response = await server.app.request("/api/market/overview");
      const body = await json(response);
      expect(response.status).toBe(404);
      expect(body.error?.code).toBe("SNAPSHOT_NOT_FOUND");
    } finally {
      await server.cleanup();
    }
  });
});
