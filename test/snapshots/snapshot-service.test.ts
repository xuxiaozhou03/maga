import { appendFile, mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recoverSystem } from "../../src/snapshots/recovery.js";
import { listSnapshotDirectories } from "../../src/snapshots/repository.js";
import { SnapshotService } from "../../src/snapshots/snapshot-service.js";
import { readCurrentPointer } from "../../src/snapshots/snapshot-system.js";
import { verifySnapshot } from "../../src/snapshots/snapshot-verifier.js";
import { JsonStore } from "../../src/storage/json-store.js";
import { LockManager } from "../../src/storage/lock-manager.js";
import { TaskService } from "../../src/tasks/task-service.js";
import { loadCalculationConfig } from "../calculations/support.js";
import { createTempDataRoot } from "../storage/support.js";
import { readSnapshotIndexFileForTest } from "../support/snapshot-system.js";
import { makeSnapshotFixture, SNAPSHOT_ANALYSIS_DATE } from "../support/snapshots.js";

function sequentialClock(): () => Date {
  let tick = 0;
  return () => {
    tick += 1;
    return new Date(Date.parse("2026-11-15T08:00:00.000Z") + tick * 1_000);
  };
}

describe("SnapshotService", () => {
  it("publishes, skips identical input, and creates a new version on force", async () => {
    const fixtureRoot = await createTempDataRoot();
    try {
      const store = new JsonStore(fixtureRoot.paths);
      const locks = new LockManager(fixtureRoot.paths);
      const service = new SnapshotService(fixtureRoot.paths, store, locks, {
        now: sequentialClock(),
      });
      const config = await loadCalculationConfig();
      const fixture = makeSnapshotFixture(config);
      const factory = async (version: number) => fixture.makePayload(version);

      const first = await service.publish(fixture.digest, factory, { reason: "daily" });
      expect(first).toMatchObject({
        status: "success",
        analysisDate: SNAPSHOT_ANALYSIS_DATE,
        snapshotVersion: 1,
        snapshotPath: `snapshots/${SNAPSHOT_ANALYSIS_DATE}/v1`,
      });
      expect(first.task.status).toBe("success");
      expect(first.task.steps.map((step) => step.name)).toEqual([
        "build_snapshot",
        "validate_snapshot",
        "publish_snapshot",
      ]);

      const firstVerification = await verifySnapshot(fixtureRoot.paths, store, first.snapshotPath);
      expect(firstVerification.valid).toBe(true);
      expect(firstVerification.manifest?.parentVersion).toBeNull();
      await expect(readCurrentPointer(fixtureRoot.paths, store)).resolves.toMatchObject({
        analysisDate: SNAPSHOT_ANALYSIS_DATE,
        snapshotVersion: 1,
        snapshotPath: first.snapshotPath,
      });
      await expect(readSnapshotIndexFileForTest(fixtureRoot.paths, store)).resolves.toMatchObject({
        dates: [
          {
            analysisDate: SNAPSHOT_ANALYSIS_DATE,
            latestVersion: 1,
            versions: [{ version: 1, status: "published" }],
          },
        ],
      });

      const skipped = await service.publish(fixture.digest, factory, { reason: "daily" });
      expect(skipped.status).toBe("skipped");
      expect(skipped.snapshotVersion).toBe(1);
      expect(await listSnapshotDirectories(fixtureRoot.paths)).toHaveLength(1);
      expect((await new TaskService(fixtureRoot.paths, store).read(skipped.taskId))?.status).toBe(
        "skipped",
      );

      const forced = await service.publish(fixture.digest, factory, {
        reason: "force",
        force: true,
      });
      expect(forced).toMatchObject({ status: "success", snapshotVersion: 2 });
      expect(await listSnapshotDirectories(fixtureRoot.paths)).toHaveLength(2);
      const forcedVerification = await verifySnapshot(
        fixtureRoot.paths,
        store,
        forced.snapshotPath,
      );
      expect(forcedVerification.manifest?.parentVersion).toBe(1);
      await expect(readCurrentPointer(fixtureRoot.paths, store)).resolves.toMatchObject({
        snapshotVersion: 2,
        snapshotPath: forced.snapshotPath,
      });
      await expect(readSnapshotIndexFileForTest(fixtureRoot.paths, store)).resolves.toMatchObject({
        dates: [
          {
            latestVersion: 2,
            versions: [{ version: 1 }, { version: 2 }],
          },
        ],
      });
    } finally {
      await fixtureRoot.cleanup();
    }
  });

  it("does not advance current when validation fails", async () => {
    const fixtureRoot = await createTempDataRoot();
    try {
      const store = new JsonStore(fixtureRoot.paths);
      const locks = new LockManager(fixtureRoot.paths);
      const service = new SnapshotService(fixtureRoot.paths, store, locks, {
        now: sequentialClock(),
      });
      const config = await loadCalculationConfig();
      const fixture = makeSnapshotFixture(config);

      const first = await service.publish(
        fixture.digest,
        async (version) => fixture.makePayload(version),
        { reason: "daily" },
      );
      await expect(
        service.publish(
          fixture.digest,
          async (version) => {
            const payload = fixture.makePayload(version);
            return {
              ...payload,
              rankings: {
                ...payload.rankings,
                return_1d: { ...payload.rankings.return_1d, snapshotVersion: 999 },
              },
            };
          },
          { reason: "force", force: true },
        ),
      ).rejects.toThrow("snapshotVersion does not match target version");

      expect(await listSnapshotDirectories(fixtureRoot.paths)).toHaveLength(1);
      await expect(readCurrentPointer(fixtureRoot.paths, store)).resolves.toMatchObject({
        snapshotVersion: 1,
        snapshotPath: first.snapshotPath,
      });
      const failedTask = (await new TaskService(fixtureRoot.paths, store).list()).at(-1);
      expect(failedTask).toMatchObject({
        status: "failed",
        error: { step: "build_snapshot" },
      });
    } finally {
      await fixtureRoot.cleanup();
    }
  });

  it("reports partial success when current cannot be updated after publication", async () => {
    const fixtureRoot = await createTempDataRoot();
    try {
      const store = new JsonStore(fixtureRoot.paths);
      const locks = new LockManager(fixtureRoot.paths);
      const service = new SnapshotService(fixtureRoot.paths, store, locks, {
        now: sequentialClock(),
      });
      const config = await loadCalculationConfig();
      const fixture = makeSnapshotFixture(config);
      const factory = async (version: number) => fixture.makePayload(version);

      await service.publish(fixture.digest, factory, { reason: "daily" });
      await writeFile(join(fixtureRoot.root, "system", "current.json"), '{"broken":', "utf8");

      const result = await service.publish(fixture.digest, factory, {
        reason: "force",
        force: true,
      });
      expect(result.status).toBe("partial_success");
      expect(result.snapshotVersion).toBe(2);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: "CURRENT_UPDATE_FAILED" }),
      );
      const verification = await verifySnapshot(fixtureRoot.paths, store, result.snapshotPath);
      expect(verification.valid).toBe(true);
    } finally {
      await fixtureRoot.cleanup();
    }
  });

  it("repairs current and snapshot-index away from a corrupted snapshot", async () => {
    const fixtureRoot = await createTempDataRoot();
    try {
      const store = new JsonStore(fixtureRoot.paths);
      const locks = new LockManager(fixtureRoot.paths);
      const service = new SnapshotService(fixtureRoot.paths, store, locks, {
        now: sequentialClock(),
      });
      const config = await loadCalculationConfig();
      const fixture = makeSnapshotFixture(config);
      const factory = async (version: number) => fixture.makePayload(version);

      const first = await service.publish(fixture.digest, factory, { reason: "daily" });
      const second = await service.publish(fixture.digest, factory, {
        reason: "force",
        force: true,
      });
      const secondRoot = await fixtureRoot.paths.resolveSafe(second.snapshotPath);
      await appendFile(join(secondRoot, "rankings", "return_1d.json"), " ", "utf8");

      const staleTemp = join(fixtureRoot.root, "temp", "old-task", "file.json");
      await mkdir(join(fixtureRoot.root, "temp", "old-task"), { recursive: true });
      await writeFile(staleTemp, "{}", "utf8");
      const old = new Date("2026-11-10T00:00:00.000Z");
      await utimes(staleTemp, old, old);

      const report = await recoverSystem(fixtureRoot.paths, store, locks, {
        now: new Date("2026-11-15T09:00:00.000Z"),
      });
      expect(report.scannedSnapshots).toBe(2);
      expect(report.validSnapshots).toBe(1);
      expect(report.invalidSnapshots).toEqual([
        expect.objectContaining({ relativePath: second.snapshotPath }),
      ]);
      expect(report.currentRepaired).toBe(true);
      expect(report.currentPath).toBe(first.snapshotPath);
      await expect(readCurrentPointer(fixtureRoot.paths, store)).resolves.toMatchObject({
        snapshotVersion: 1,
        snapshotPath: first.snapshotPath,
      });
      await expect(readSnapshotIndexFileForTest(fixtureRoot.paths, store)).resolves.toMatchObject({
        dates: [{ latestVersion: 1, versions: [{ version: 1 }] }],
      });
    } finally {
      await fixtureRoot.cleanup();
    }
  });
});
