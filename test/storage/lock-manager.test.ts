import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { LockManager, lockOwnerPath } from "../../src/storage/lock-manager.js";
import { createTempDataRoot } from "./support.js";

describe("LockManager", () => {
  it("records lock metadata and rejects a conflicting task", async () => {
    const fixture = await createTempDataRoot();
    try {
      const manager = new LockManager(fixture.paths, {
        pid: 123,
        host: "test-host",
        now: () => Date.parse("2026-11-15T08:00:00.000Z"),
      });
      const first = await manager.acquire(
        "daily-2026-11-13",
        { taskId: "task-a", reason: "daily" },
        { maxWaitMs: 0 },
      );

      const owner = JSON.parse(await readFile(lockOwnerPath(first.targetPath), "utf8")) as Record<
        string,
        unknown
      >;
      expect(owner).toMatchObject({
        taskId: "task-a",
        pid: 123,
        host: "test-host",
        reason: "daily",
      });

      await expect(
        manager.acquire("daily-2026-11-13", { taskId: "task-b" }, { maxWaitMs: 0 }),
      ).rejects.toMatchObject({ code: "TASK_CONFLICT" });

      await first.release();
      await expect(manager.isLocked("daily-2026-11-13")).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("releases the lock when a guarded operation throws", async () => {
    const fixture = await createTempDataRoot();
    try {
      const manager = new LockManager(fixture.paths);

      await expect(
        manager.withLock(
          "master",
          { taskId: "task-fail" },
          async () => {
            throw new Error("operation failed");
          },
          { maxWaitMs: 0 },
        ),
      ).rejects.toThrow("operation failed");

      await expect(manager.isLocked("master")).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects unsafe lock names", async () => {
    const fixture = await createTempDataRoot();
    try {
      const manager = new LockManager(fixture.paths);
      await expect(
        manager.acquire("../escape", { taskId: "task" }, { maxWaitMs: 0 }),
      ).rejects.toMatchObject({ code: "PATH_ESCAPE" });
    } finally {
      await fixture.cleanup();
    }
  });

  it("cleans a lock whose recorded process no longer exists", async () => {
    const fixture = await createTempDataRoot();
    try {
      const manager = new LockManager(fixture.paths, {
        pid: 2_147_483_647,
        host: "test-host",
        now: () => Date.parse("2026-11-15T08:00:00.000Z"),
      });
      await manager.acquire("daily-2026-11-13", { taskId: "task-dead" }, { maxWaitMs: 0 });

      const result = await manager.cleanupStaleLocks({
        now: () => Date.parse("2026-11-15T08:00:01.000Z"),
      });
      expect(result.cleaned).toEqual(["daily-2026-11-13"]);
      await expect(manager.isLocked("daily-2026-11-13")).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
