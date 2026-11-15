import { describe, expect, it } from "vitest";
import { createTestServer, makeNoopKlineSource, type TestServer } from "../support/server.js";
import { SNAPSHOT_ANALYSIS_DATE } from "../support/snapshots.js";

async function html(response: Response): Promise<string> {
  return response.text();
}

describe("HTML pages", () => {
  it("renders useful empty states before the first snapshot", async () => {
    const server = await createTestServer({ publish: false, klineSource: null });
    try {
      const root = await server.app.request("/");
      const rootHtml = await html(root);
      expect(root.status).toBe(200);
      expect(rootHtml).toContain("还没有可用的已发布快照");
      expect(rootHtml).toContain("/assets/styles.css");
      expect(rootHtml).not.toContain("https://");

      for (const path of ["/etfs", "/market", "/reports", "/admin"]) {
        const response = await server.app.request(path);
        expect(response.status).toBe(200);
        expect(await html(response)).toContain("ETF 市场分析系统");
      }
    } finally {
      await server.cleanup();
    }
  });

  it("shows snapshot metadata, filters and missing-value conventions on the ETF list", async () => {
    const server = await createTestServer({ klineSource: makeNoopKlineSource() });
    try {
      const response = await server.app.request("/etfs?category=pending&pageSize=10");
      const body = await html(response);
      expect(response.status).toBe(200);
      expect(body).toContain(SNAPSHOT_ANALYSIS_DATE);
      expect(body).toContain("v1");
      expect(body).toContain("全池排名");
      expect(body).toContain("筛选集排名");
      expect(body).toContain("待确认");
      expect(body).toContain("缺失值显示为 “—”");

      const noMatch = await server.app.request("/etfs?q=not-an-etf");
      expect(await html(noMatch)).toContain("当前筛选条件没有匹配的 ETF");
    } finally {
      await server.cleanup();
    }
  });

  it("renders ETF tabs, Kline controls and history chart", async () => {
    const server = await createTestServer({ klineSource: makeNoopKlineSource() });
    try {
      const response = await server.app.request(
        `/etfs/510300.SH?date=${SNAPSHOT_ANALYSIS_DATE}&version=1`,
      );
      const body = await html(response);
      expect(response.status).toBe(200);
      expect(body).toContain("综合表现");
      expect(body).toContain("行情趋势");
      expect(body).toContain("研究发现");
      expect(body).toContain('id="kline-chart"');
      expect(body).toContain('data-code="510300.SH"');
      expect(body).toContain('id="history-chart"');
      expect(body).toContain("前复权");
      expect(body).toContain("只读取每日已发布快照");
    } finally {
      await server.cleanup();
    }
  });

  it("renders market analysis, report placeholder and read-only administration", async () => {
    const server = await createTestServer({ klineSource: makeNoopKlineSource() });
    try {
      const market = await server.app.request("/market");
      const marketHtml = await html(market);
      expect(market.status).toBe(200);
      expect(marketHtml).toContain("市场分析");
      expect(marketHtml).toContain("分类统计仅作辅助维度");
      expect(marketHtml).toContain("市场状态证据");

      const reports = await server.app.request("/reports");
      const reportsHtml = await html(reports);
      expect(reports.status).toBe(200);
      expect(reportsHtml).toContain("报告列表");
      expect(reportsHtml).toContain("暂无报告");

      const admin = await server.app.request("/admin");
      const adminHtml = await html(admin);
      expect(admin.status).toBe(200);
      expect(adminHtml).toContain("历史快照");
      expect(adminHtml).toContain("计算任务");
      expect(adminHtml).toContain("规则配置");
      expect(adminHtml).toContain(server.root.root);
    } finally {
      await server.cleanup();
    }
  });

  it("shows a yellow partial-data banner for partial snapshots", async () => {
    const server = await createTestServer({ partial: true, klineSource: null });
    try {
      for (const path of ["/", "/etfs", "/market"]) {
        const response = await server.app.request(path);
        const body = await html(response);
        expect(response.status).toBe(200);
        expect(body).toContain("partial-banner");
        expect(body).toContain("当前快照包含");
      }
    } finally {
      await server.cleanup();
    }
  });

  it("returns page errors for unknown ETFs, categories and dates", async () => {
    const server = await createTestServer({ klineSource: null });
    try {
      const missingEtf = await server.app.request("/etfs/999999.SH");
      expect(missingEtf.status).toBe(404);
      expect(await html(missingEtf)).toContain("ETF_NOT_FOUND");

      const invalidCategory = await server.app.request("/etfs?category=not-a-category");
      expect(invalidCategory.status).toBe(400);
      expect(await html(invalidCategory)).toContain("INVALID_QUERY");

      const missingDate = await server.app.request("/etfs?date=2026-11-14");
      expect(missingDate.status).toBe(404);
      expect(await html(missingDate)).toContain("SNAPSHOT_NOT_FOUND");
    } finally {
      await server.cleanup();
    }
  });

  it("ships responsive local CSS and tablet/mobile breakpoints", async () => {
    const server = await createTestServer({ publish: false, klineSource: null });
    try {
      const response = await server.app.request("/assets/styles.css");
      const body = await html(response);
      expect(response.status).toBe(200);
      expect(body).toContain("@media (max-width: 768px)");
      expect(body).toContain("@media (max-width: 1080px)");
      expect(body).not.toContain("@import");
    } finally {
      await server.cleanup();
    }
  });
});
