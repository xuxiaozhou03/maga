import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SnapshotReader, SnapshotReadError } from "../../src/snapshots/snapshot-reader.js";
import { SnapshotService } from "../../src/snapshots/snapshot-service.js";
import { JsonStore } from "../../src/storage/json-store.js";
import { LockManager } from "../../src/storage/lock-manager.js";
import { createTestServer } from "../support/server.js";
import { SNAPSHOT_ANALYSIS_DATE } from "../support/snapshots.js";

describe("SnapshotReader history reads", () => {
  it("selects one latest version per date and verifies historical ETF checksums", async () => {
    const server = await createTestServer({ publish: false, klineSource: null });
    try {
      const store = new JsonStore(server.root.paths);
      const service = new SnapshotService(
        server.root.paths,
        store,
        new LockManager(server.root.paths),
        { now: () => new Date("2026-11-15T08:00:00.000Z") },
      );
      await service.publish(
        server.fixture.digest,
        async (version) => server.fixture.makePayload(version),
        { reason: "daily" },
      );
      await service.publish(
        server.fixture.digest,
        async (version) => server.fixture.makePayload(version),
        { reason: "force", force: true },
      );

      const reader = new SnapshotReader(server.root.paths, store);
      const references = await reader.listSince(SNAPSHOT_ANALYSIS_DATE, SNAPSHOT_ANALYSIS_DATE);
      expect(references).toHaveLength(1);
      expect(references[0]).toMatchObject({
        analysisDate: SNAPSHOT_ANALYSIS_DATE,
        snapshotVersion: 2,
      });

      const feature = await reader.loadFeatureAt(references[0]!, "510300.SH");
      expect(feature).toMatchObject({ code: "510300.SH", analysisDate: SNAPSHOT_ANALYSIS_DATE });

      await appendFile(
        join(server.root.root, "snapshots", SNAPSHOT_ANALYSIS_DATE, "v2", "etfs", "510300.SH.json"),
        " ",
        "utf8",
      );
      await expect(reader.loadFeatureAt(references[0]!, "510300.SH")).rejects.toMatchObject<
        Partial<SnapshotReadError>
      >({ code: "SNAPSHOT_CORRUPT" });
    } finally {
      await server.cleanup();
    }
  });
});
