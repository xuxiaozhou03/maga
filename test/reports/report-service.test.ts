import { describe, expect, it } from "vitest";
import type { ReportAiProvider } from "../../src/reports/ai-provider.js";
import { reportIndexSchema } from "../../src/domain/report.js";
import { verifySnapshot } from "../../src/snapshots/snapshot-verifier.js";
import { createTestServer, makeNoopKlineSource } from "../support/server.js";
import { SNAPSHOT_ANALYSIS_DATE } from "../support/snapshots.js";

const VALID_AI_CONTENT = {
  title: "AI 市场观察",
  summary: "市场状态与收益结构来自已发布快照。",
  sections: [
    {
      heading: "市场收益",
      body: "20 日收益中位数来自快照。",
      citations: [
        { path: "market/returns.json", field: "/returns/20d/median" },
        { path: "market/returns.json", field: "/returns/20d/validCount" },
      ],
    },
  ],
  keyFindings: [],
};

function fakeProvider(content: unknown, counter?: { calls: number }): ReportAiProvider {
  return {
    provider: "fake",
    model: "fake-model",
    promptVersion: "report-v1",
    async generate() {
      if (counter !== undefined) {
        counter.calls += 1;
      }
      return content;
    },
  };
}

describe("ReportService", () => {
  it("generates deterministic template reports, indexes them, and preserves older reports", async () => {
    const server = await createTestServer({ klineSource: makeNoopKlineSource() });
    try {
      const first = await server.services.reports.generate({ mode: "template" });
      const second = await server.services.reports.generate({ mode: "template" });

      expect(first.report).toMatchObject({
        reportId: "report_20261113_001",
        analysisDate: SNAPSHOT_ANALYSIS_DATE,
        snapshotVersion: 1,
        mode: "template",
        status: "success",
        fallbackFrom: null,
        model: null,
        error: null,
      });
      expect(second.report.reportId).toBe("report_20261113_002");
      expect(second.report.content).toEqual(first.report.content);
      expect(second.report.citations).toEqual(first.report.citations);
      expect(second.report.inputFingerprint).toBe(first.report.inputFingerprint);
      expect(first.report.citations.length).toBeGreaterThan(10);
      expect(first.task.steps.map((step) => step.name)).toEqual(["generate_report"]);
      expect(first.task.status).toBe("success");

      const index = await server.services.store.read(
        server.services.paths.reportIndexFile(SNAPSHOT_ANALYSIS_DATE),
        reportIndexSchema,
      );
      expect(index?.reports.map((report) => report.reportId)).toEqual([
        "report_20261113_002",
        "report_20261113_001",
      ]);
      expect(await server.services.reports.find(first.report.reportId)).toMatchObject({
        reportId: first.report.reportId,
      });
    } finally {
      await server.cleanup();
    }
  });

  it("accepts a valid AI report and records model metadata", async () => {
    const server = await createTestServer({
      klineSource: makeNoopKlineSource(),
      reportAiProvider: fakeProvider(VALID_AI_CONTENT),
    });
    try {
      const result = await server.services.reports.generate({ mode: "ai" });
      expect(result.report).toMatchObject({
        mode: "ai",
        status: "success",
        fallbackFrom: null,
        model: {
          provider: "fake",
          name: "fake-model",
          promptVersion: "report-v1",
        },
        error: null,
      });
      expect(result.report.content.title).toBe("AI 市场观察");
      expect(result.task.status).toBe("success");
      expect(result.report.citations).toEqual([
        { path: "market/returns.json", field: "/returns/20d/median" },
        { path: "market/returns.json", field: "/returns/20d/validCount" },
      ]);
    } finally {
      await server.cleanup();
    }
  });

  it("falls back to a template when no AI provider is configured", async () => {
    const server = await createTestServer({ klineSource: makeNoopKlineSource() });
    try {
      const before = await server.services.snapshots.current();
      const result = await server.services.reports.generate({ mode: "ai" });
      const after = await server.services.snapshots.current();

      expect(result.report).toMatchObject({
        mode: "template",
        status: "success",
        fallbackFrom: "ai",
        error: { code: "REPORT_AI_UNAVAILABLE" },
      });
      expect(result.fallback).toBe(true);
      expect(result.task.status).toBe("partial_success");
      expect(result.task.warnings).toContainEqual(
        expect.objectContaining({ code: "REPORT_AI_FALLBACK" }),
      );
      expect(after).toEqual(before);
      expect(
        (
          await verifySnapshot(
            server.services.paths,
            server.services.store,
            `snapshots/${SNAPSHOT_ANALYSIS_DATE}/v1`,
          )
        ).valid,
      ).toBe(true);
    } finally {
      await server.cleanup();
    }
  });

  it("rejects invalid AI citations and falls back without deleting an older report", async () => {
    const counter = { calls: 0 };
    const server = await createTestServer({
      klineSource: makeNoopKlineSource(),
      reportAiProvider: fakeProvider(
        {
          ...VALID_AI_CONTENT,
          sections: [
            {
              heading: "非法引用",
              body: "该引用不存在。",
              citations: [{ path: "market/returns.json", field: "/returns/20d/notARealField" }],
            },
          ],
        },
        counter,
      ),
    });
    try {
      const older = await server.services.reports.generate({ mode: "template" });
      const before = await server.services.snapshots.current();
      const result = await server.services.reports.generate({ mode: "ai" });
      const after = await server.services.snapshots.current();

      expect(counter.calls).toBe(2);
      expect(result.report).toMatchObject({
        mode: "template",
        status: "success",
        fallbackFrom: "ai",
        error: { code: "REPORT_CITATION_INVALID" },
      });
      expect(result.report.citations).not.toContainEqual(
        expect.objectContaining({ field: "/returns/20d/notARealField" }),
      );
      expect(await server.services.reports.find(older.report.reportId)).not.toBeNull();
      expect(after).toEqual(before);
    } finally {
      await server.cleanup();
    }
  });
});
