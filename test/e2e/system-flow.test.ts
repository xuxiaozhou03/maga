import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BackupService } from "../../src/backups/backup-service.js";
import { reportSchema } from "../../src/domain/report.js";
import { createApp } from "../../src/server/app.js";
import { createAppServices } from "../../src/server/context.js";
import { SnapshotService } from "../../src/snapshots/snapshot-service.js";
import { verifySnapshot } from "../../src/snapshots/snapshot-verifier.js";
import { JsonStore } from "../../src/storage/json-store.js";
import { LockManager } from "../../src/storage/lock-manager.js";
import { createTestServer, makeNoopKlineSource } from "../support/server.js";
import { SNAPSHOT_ANALYSIS_DATE } from "../support/snapshots.js";

async function waitForTask(app: ReturnType<typeof createApp>, taskId: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await app.request(`/api/tasks/${taskId}`);
    const body = (await response.json()) as {
      ok: boolean;
      data: { status: string };
    };
    if (["success", "partial_success", "failed", "skipped"].includes(body.data.status)) {
      return body.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Task did not finish: ${taskId}`);
}

describe("E2E: snapshot -> report -> backup -> restore", () => {
  it("keeps current and reports readable after restoring a damaged data directory", async () => {
    const server = await createTestServer({
      publish: false,
      klineSource: makeNoopKlineSource(),
    });
    const backupRoot = await mkdtemp(join(tmpdir(), "maga-e2e-backup-"));
    const previousAdminToken = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = "e2e-admin-token";
    try {
      const store = new JsonStore(server.services.paths);
      const snapshotService = new SnapshotService(
        server.services.paths,
        store,
        new LockManager(server.services.paths),
        { now: () => new Date("2026-11-15T08:00:00.000Z") },
      );
      const factory = async (version: number) => server.fixture.makePayload(version);
      const first = await snapshotService.publish(server.fixture.digest, factory, {
        reason: "daily",
      });
      expect(first.status).toBe("success");
      expect(await server.services.snapshots.current()).toMatchObject({
        analysisDate: SNAPSHOT_ANALYSIS_DATE,
        snapshotVersion: 1,
      });

      const skipped = await snapshotService.publish(server.fixture.digest, factory, {
        reason: "daily",
      });
      expect(skipped.status).toBe("skipped");
      const forced = await snapshotService.publish(server.fixture.digest, factory, {
        reason: "force",
        force: true,
      });
      expect(forced).toMatchObject({ status: "success", snapshotVersion: 2 });
      expect(await server.services.snapshots.current()).toMatchObject({
        snapshotVersion: 2,
        snapshotPath: `snapshots/${SNAPSHOT_ANALYSIS_DATE}/v2`,
      });

      const reportResponse = await server.app.request("/api/admin/reports/generate", {
        method: "POST",
        headers: {
          authorization: "Bearer e2e-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          date: SNAPSHOT_ANALYSIS_DATE,
          version: 2,
          mode: "template",
        }),
      });
      expect(reportResponse.status).toBe(202);
      const started = (await reportResponse.json()) as {
        ok: boolean;
        data: { taskId: string };
      };
      expect(started.ok).toBe(true);
      expect((await waitForTask(server.app, started.data.taskId)).status).toBe("success");

      const listResponse = await server.app.request(
        `/api/reports?date=${SNAPSHOT_ANALYSIS_DATE}&version=2`,
      );
      const list = (await listResponse.json()) as {
        data: { total: number; items: Array<{ reportId: string }> };
      };
      expect(listResponse.status).toBe(200);
      expect(list.data.total).toBe(1);
      const reportId = list.data.items[0]!.reportId;
      const reportFile = await store.read(
        server.services.paths.reportFile(SNAPSHOT_ANALYSIS_DATE, reportId),
        reportSchema,
      );
      expect(reportFile).toMatchObject({
        reportId,
        snapshotVersion: 2,
        mode: "template",
        status: "success",
      });

      const detailResponse = await server.app.request(
        `/api/reports/${reportId}?date=${SNAPSHOT_ANALYSIS_DATE}`,
      );
      expect(detailResponse.status).toBe(200);
      const pageResponse = await server.app.request(
        `/reports/${reportId}?date=${SNAPSHOT_ANALYSIS_DATE}&version=2`,
      );
      expect(pageResponse.status).toBe(200);
      expect(await pageResponse.text()).toContain("模板生成");

      const backupService = new BackupService(server.services.paths, store, {
        now: () => new Date("2026-11-15T09:00:00.000Z"),
      });
      const backup = await backupService.create({ to: backupRoot });
      expect(backup.manifest.totals.files).toBeGreaterThan(0);

      await rm(join(server.root.root, "snapshots"), { recursive: true, force: true });
      await rm(join(server.root.root, "reports"), { recursive: true, force: true });
      await writeFile(join(server.root.root, "system", "current.json"), '{"broken":', "utf8");
      await writeFile(
        join(server.root.root, "system", "snapshot-index.json"),
        '{"broken":',
        "utf8",
      );

      const restored = await backupService.restore({ from: backup.backupPath });
      expect(restored.current).toMatchObject({
        analysisDate: SNAPSHOT_ANALYSIS_DATE,
        snapshotVersion: 2,
      });
      expect(restored.currentVerification?.valid).toBe(true);
      expect(restored.recovery.invalidSnapshots).toEqual([]);
      expect(
        (
          await verifySnapshot(
            server.services.paths,
            server.services.store,
            `snapshots/${SNAPSHOT_ANALYSIS_DATE}/v2`,
          )
        ).valid,
      ).toBe(true);

      const restoredServices = await createAppServices({
        dataRoot: server.root.root,
        config: server.config,
        klineSource: null,
        reportAiProvider: null,
        now: () => new Date("2026-11-15T09:00:00.000Z"),
      });
      const restoredApp = createApp(restoredServices);
      const health = await restoredApp.request("/api/health");
      expect(health.status).toBe(200);
      expect(
        ((await health.json()) as { data: { current: { snapshotVersion: number } } }).data.current,
      ).toMatchObject({ snapshotVersion: 2 });

      const etfs = await restoredApp.request(
        `/api/etfs?date=${SNAPSHOT_ANALYSIS_DATE}&version=2&pageSize=10`,
      );
      expect(etfs.status).toBe(200);
      const restoredReport = await restoredApp.request(
        `/api/reports/${reportId}?date=${SNAPSHOT_ANALYSIS_DATE}`,
      );
      expect(restoredReport.status).toBe(200);
      const restoredPage = await restoredApp.request(
        `/reports/${reportId}?date=${SNAPSHOT_ANALYSIS_DATE}&version=2`,
      );
      expect(restoredPage.status).toBe(200);
      expect(await restoredPage.text()).toContain("引用汇总");
    } finally {
      if (previousAdminToken === undefined) {
        delete process.env.ADMIN_TOKEN;
      } else {
        process.env.ADMIN_TOKEN = previousAdminToken;
      }
      await server.cleanup();
      await rm(backupRoot, { recursive: true, force: true });
    }
  }, 20_000);
});
