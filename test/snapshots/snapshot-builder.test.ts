import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RANKING_CODES } from "../../src/domain/rankings.js";
import { buildSnapshot } from "../../src/snapshots/snapshot-builder.js";
import { verifySnapshot } from "../../src/snapshots/snapshot-verifier.js";
import { JsonStore } from "../../src/storage/json-store.js";
import { loadCalculationConfig } from "../calculations/support.js";
import { createTempDataRoot } from "../storage/support.js";
import { makeSnapshotFixture, SNAPSHOT_ANALYSIS_DATE } from "../support/snapshots.js";

describe("snapshot builder and verifier", () => {
  it("writes the complete snapshot tree with a checksummed manifest", async () => {
    const fixtureRoot = await createTempDataRoot();
    try {
      const store = new JsonStore(fixtureRoot.paths);
      const config = await loadCalculationConfig();
      const fixture = makeSnapshotFixture(config);
      const built = await buildSnapshot(fixtureRoot.paths, store, fixture.makePayload(1), {
        snapshotVersion: 1,
        taskId: "task_test",
        createdAt: "2026-11-15T08:00:00.000Z",
        reason: "daily",
        parentVersion: null,
        dataStatus: "complete",
      });

      expect(built.manifest.status).toBe("validated");
      expect(built.manifest.counts).toEqual({ etfs: 5, rankings: 13, market: 7, findings: 2 });
      expect(built.manifest.files).toHaveLength(27);
      expect(built.manifest.files.map((file) => file.path)).not.toContain("rankings/overall.json");
      for (const rankingCode of RANKING_CODES) {
        expect(built.manifest.files.map((file) => file.path)).toContain(
          `rankings/${rankingCode}.json`,
        );
      }

      const verification = await verifySnapshot(fixtureRoot.paths, store, built.relativePath, {
        allowedStatuses: ["validated"],
      });
      expect(verification).toMatchObject({ valid: true, issues: [] });
      expect(verification.manifest?.analysisDate).toBe(SNAPSHOT_ANALYSIS_DATE);
    } finally {
      await fixtureRoot.cleanup();
    }
  });

  it("detects checksum corruption and missing files", async () => {
    const fixtureRoot = await createTempDataRoot();
    try {
      const store = new JsonStore(fixtureRoot.paths);
      const config = await loadCalculationConfig();
      const fixture = makeSnapshotFixture(config);
      const built = await buildSnapshot(fixtureRoot.paths, store, fixture.makePayload(1), {
        snapshotVersion: 1,
        taskId: "task_corrupt",
        createdAt: "2026-11-15T08:00:00.000Z",
        reason: "daily",
        parentVersion: null,
        dataStatus: "complete",
      });
      const root = await fixtureRoot.paths.resolveSafe(built.relativePath);
      await appendFile(join(root, "market", "state.json"), " ", "utf8");

      const verification = await verifySnapshot(fixtureRoot.paths, store, built.relativePath, {
        allowedStatuses: ["validated"],
      });
      expect(verification.valid).toBe(false);
      expect(verification.issues).toContain("CHECKSUM_MISMATCH: market/state.json");
    } finally {
      await fixtureRoot.cleanup();
    }
  });
});
