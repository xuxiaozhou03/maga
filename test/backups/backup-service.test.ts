import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BackupService } from "../../src/backups/backup-service.js";
import { verifySnapshot } from "../../src/snapshots/snapshot-verifier.js";
import { createTestServer, makeNoopKlineSource } from "../support/server.js";
import { SNAPSHOT_ANALYSIS_DATE } from "../support/snapshots.js";

async function withBackupRoot<T>(operation: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "maga-backup-test-"));
  try {
    return await operation(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("BackupService", () => {
  it("backs up durable data only and writes a verifiable manifest", async () => {
    const server = await createTestServer({ klineSource: makeNoopKlineSource() });
    try {
      const report = await server.services.reports.generate({ mode: "template" });
      await writeFile(
        join(server.root.root, "cache", "klines", "ignored.json"),
        '{"cache":true}\n',
        "utf8",
      );
      await writeFile(join(server.root.root, "temp", "ignored.json"), '{"temp":true}\n', "utf8");
      await mkdir(join(server.root.root, "system", "locks"), { recursive: true });
      await writeFile(join(server.root.root, "system", "locks", "ignored.lock"), "lock\n", "utf8");

      await withBackupRoot(async (backupRoot) => {
        const service = new BackupService(server.services.paths, server.services.store, {
          now: () => new Date("2026-11-15T09:00:00.000Z"),
        });
        const result = await service.create({ to: backupRoot });
        expect(result.manifest.directories).toEqual([
          "config",
          "master",
          "valuation",
          "snapshots",
          "reports",
          "system/selection",
        ]);
        expect(result.manifest.entries.map((entry) => entry.path)).toContain(
          `reports/${SNAPSHOT_ANALYSIS_DATE}/${report.report.reportId}.json`,
        );
        expect(result.manifest.entries.map((entry) => entry.path)).toContain("system/current.json");
        expect(result.manifest.entries.map((entry) => entry.path)).toContain(
          "system/snapshot-index.json",
        );
        for (const entry of result.manifest.entries) {
          expect(entry.path.startsWith("cache/")).toBe(false);
          expect(entry.path.startsWith("temp/")).toBe(false);
          expect(entry.path.startsWith("system/locks/")).toBe(false);
        }

        const validation = await service.validate(result.backupPath);
        expect(validation.verifiedFiles).toBe(result.manifest.totals.files);
        expect(validation.verifiedBytes).toBe(result.manifest.totals.bytes);
        expect(
          JSON.parse(await readFile(join(result.backupPath, "manifest.json"), "utf8")),
        ).toMatchObject({
          schemaVersion: 1,
          includeTasks: false,
        });
      });
    } finally {
      await server.cleanup();
    }
  });

  it("restores snapshots, current, reports and config after damage", async () => {
    const server = await createTestServer({ klineSource: makeNoopKlineSource() });
    try {
      const report = await server.services.reports.generate({ mode: "template" });
      const before = await server.services.snapshots.current();
      await withBackupRoot(async (backupRoot) => {
        const service = new BackupService(server.services.paths, server.services.store, {
          now: () => new Date("2026-11-15T09:00:00.000Z"),
        });
        const backup = await service.create({ to: backupRoot });

        await rm(join(server.root.root, "snapshots"), { recursive: true, force: true });
        await rm(join(server.root.root, "reports"), { recursive: true, force: true });
        await writeFile(join(server.root.root, "system", "current.json"), '{"broken":', "utf8");
        await writeFile(
          join(server.root.root, "system", "snapshot-index.json"),
          '{"broken":',
          "utf8",
        );

        const restored = await service.restore({ from: backup.backupPath });
        expect(restored.current).toMatchObject({
          analysisDate: SNAPSHOT_ANALYSIS_DATE,
          snapshotVersion: 1,
        });
        expect(restored.currentVerification?.valid).toBe(true);
        expect(restored.recovery.validSnapshots).toBe(1);
        expect(restored.recovery.invalidSnapshots).toEqual([]);
        expect(restored.configBackupPath).not.toBeNull();
        expect(
          (
            await verifySnapshot(
              server.services.paths,
              server.services.store,
              `snapshots/${SNAPSHOT_ANALYSIS_DATE}/v1`,
            )
          ).valid,
        ).toBe(true);
        expect(await server.services.reports.find(report.report.reportId)).toMatchObject({
          reportId: report.report.reportId,
        });
        expect(await server.services.snapshots.current()).toEqual(before);
      });
    } finally {
      await server.cleanup();
    }
  });

  it("rejects a tampered backup before modifying current data", async () => {
    const server = await createTestServer({ klineSource: makeNoopKlineSource() });
    try {
      const before = await server.services.snapshots.current();
      await withBackupRoot(async (backupRoot) => {
        const service = new BackupService(server.services.paths, server.services.store);
        const backup = await service.create({ to: backupRoot });
        const target = backup.manifest.entries.find((entry) => entry.path.startsWith("snapshots/"));
        expect(target).toBeDefined();
        await appendFile(join(backup.backupPath, target!.path), " ", "utf8");
        await expect(service.validate(backup.backupPath)).rejects.toMatchObject({
          code: "BACKUP_INVALID",
        });
        await expect(service.restore({ from: backup.backupPath })).rejects.toMatchObject({
          code: "BACKUP_INVALID",
        });
        expect(await server.services.snapshots.current()).toEqual(before);
      });
    } finally {
      await server.cleanup();
    }
  });

  it("rejects extra files that are not listed in the manifest", async () => {
    const server = await createTestServer({ klineSource: makeNoopKlineSource() });
    try {
      await withBackupRoot(async (backupRoot) => {
        const service = new BackupService(server.services.paths, server.services.store);
        const backup = await service.create({ to: backupRoot });
        await writeFile(join(backup.backupPath, "extra.txt"), "unexpected\n", "utf8");
        await expect(service.validate(backup.backupPath)).rejects.toMatchObject({
          code: "BACKUP_INVALID",
        });
      });
    } finally {
      await server.cleanup();
    }
  });
});
