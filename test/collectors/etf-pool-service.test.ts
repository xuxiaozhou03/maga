import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { EtfPoolService, type EtfPoolSource } from "../../src/collectors/etf-pool-service.js";
import { categoryMappingSchema } from "../../src/config/schemas.js";
import { masterEtfFileSchema, selectionReportSchema } from "../../src/domain/etf.js";
import type { RawEtf } from "../../src/sources/contracts.js";
import { JsonStore } from "../../src/storage/json-store.js";
import { LockManager } from "../../src/storage/lock-manager.js";
import { createTempDataRoot, type TempDataRoot } from "../storage/support.js";

class StubSource implements EtfPoolSource {
  constructor(private fetcher: () => Promise<RawEtf[]>) {}

  fetchAll(): Promise<RawEtf[]> {
    return this.fetcher();
  }
}

async function readRawEtfs(): Promise<RawEtf[]> {
  const path = new URL("../fixtures/raw-etfs.json", import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as RawEtf[];
}

async function initializeMapping(fixture: TempDataRoot): Promise<void> {
  await writeFile(
    `${fixture.root}/config/etf-category-mapping.json`,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        version: 1,
        updatedAt: "2026-11-15T00:00:00.000Z",
        items: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function setupService(rawItems: RawEtf[], options: { initializeMapping?: boolean } = {}) {
  const fixture = await createTempDataRoot();
  if (options.initializeMapping !== false) {
    await initializeMapping(fixture);
  }
  const store = new JsonStore(fixture.paths);
  const locks = new LockManager(fixture.paths);
  let clock = new Date("2026-11-15T08:00:00.000Z");
  let currentRaw = structuredClone(rawItems);
  const source = new StubSource(async () => structuredClone(currentRaw));
  const service = new EtfPoolService(source, store, locks, { now: () => clock });

  return {
    fixture,
    store,
    source,
    service,
    advanceClock: () => {
      clock = new Date(clock.getTime() + 60_000);
    },
    setRaw: (items: RawEtf[]) => {
      currentRaw = items;
    },
  };
}

describe("EtfPoolService", () => {
  it("writes master, selection report, and pending category mappings", async () => {
    const raw = await readRawEtfs();
    const context = await setupService(raw);
    try {
      const result = await context.service.refresh({ taskId: "pool-test" });

      expect(result.master.poolVersion).toBe(1);
      expect(result.master.items).toHaveLength(5);
      expect(result.master.items.map((etf) => etf.code)).toEqual([
        "510300.SH",
        "588001.SH",
        "510050.SH",
        "512002.SH",
        "512007.SH",
      ]);
      expect(result.mappingAdded).toBe(5);
      expect(result.selection.rejected).toHaveLength(8);

      await expect(context.store.read("master/etfs.json", masterEtfFileSchema)).resolves.toEqual(
        result.master,
      );
      await expect(
        context.store.read("system/selection/latest.json", selectionReportSchema),
      ).resolves.toEqual(result.selection);
      const mapping = await context.store.read(
        "config/etf-category-mapping.json",
        categoryMappingSchema,
      );
      expect(mapping?.version).toBe(2);
      expect(mapping?.items).toHaveLength(5);
      expect(mapping?.items.every((item) => item.status === "pending")).toBe(true);
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("creates the category mapping file when it is missing", async () => {
    const raw = await readRawEtfs();
    const context = await setupService(raw, { initializeMapping: false });
    try {
      const result = await context.service.refresh({ taskId: "pool-no-mapping" });

      expect(result.mappingAdded).toBe(result.master.items.length);
      const mapping = await context.store.read(
        "config/etf-category-mapping.json",
        categoryMappingSchema,
      );
      expect(mapping).toMatchObject({ schemaVersion: 1, version: 1 });
      expect(mapping?.items).toHaveLength(result.master.items.length);
      expect(mapping?.items.every((item) => item.status === "pending")).toBe(true);
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("keeps poolVersion stable for unchanged membership but changes poolHash on field updates", async () => {
    const raw = await readRawEtfs();
    const context = await setupService(raw);
    try {
      const first = await context.service.refresh({ taskId: "pool-one" });
      context.advanceClock();
      const second = await context.service.refresh({ taskId: "pool-two" });

      expect(second.master.poolVersion).toBe(first.master.poolVersion);
      expect(second.master.poolHash).toBe(first.master.poolHash);
      expect(second.mappingAdded).toBe(0);

      const changedRaw = structuredClone(raw);
      const changed = changedRaw.find((item) => item.securityCode === "510300.SH");
      if (!changed) {
        throw new Error("fixture missing 510300.SH");
      }
      changed.scale = Number(changed.scale) + 1;
      context.advanceClock();
      context.setRaw(changedRaw);

      const third = await context.service.refresh({ taskId: "pool-three" });
      expect(third.master.poolVersion).toBe(second.master.poolVersion);
      expect(third.master.poolHash).not.toBe(second.master.poolHash);
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("bumps poolVersion and records representative changes when the winner changes", async () => {
    const raw = await readRawEtfs();
    const context = await setupService(raw);
    try {
      const first = await context.service.refresh({ taskId: "pool-one" });
      const changedRaw = structuredClone(raw);
      const replacement = changedRaw.find((item) => item.securityCode === "159919.SZ");
      if (!replacement) {
        throw new Error("fixture missing 159919.SZ");
      }
      replacement.scale = 200_000_000_000;
      context.advanceClock();
      context.setRaw(changedRaw);

      const second = await context.service.refresh({ taskId: "pool-two" });

      expect(second.master.poolVersion).toBe(first.master.poolVersion + 1);
      expect(second.poolVersionBumped).toBe(true);
      expect(second.representativeChanges).toEqual([
        { trackIndex: "000300.SH", previousCode: "510300.SH", newCode: "159919.SZ" },
      ]);
      expect(second.selection.representativeChanges).toEqual(second.representativeChanges);
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("does not overwrite the previous pool when collection fails", async () => {
    const raw = await readRawEtfs();
    const context = await setupService(raw);
    try {
      const baseline = await context.service.refresh({ taskId: "pool-one" });
      const failingSource = new StubSource(async () => {
        throw new Error("upstream unavailable");
      });
      const failingService = new EtfPoolService(
        failingSource,
        context.store,
        new LockManager(context.fixture.paths),
      );

      await expect(failingService.refresh({ taskId: "pool-failed" })).rejects.toThrow(
        "upstream unavailable",
      );
      await expect(context.store.read("master/etfs.json", masterEtfFileSchema)).resolves.toEqual(
        baseline.master,
      );
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("guards large pool size changes unless force is explicit", async () => {
    const raw = await readRawEtfs();
    const context = await setupService(raw);
    try {
      await context.service.refresh({ taskId: "pool-one" });
      const smallPool = raw.filter((item) =>
        ["510300.SH", "588001.SH", "510050.SH"].includes(item.securityCode ?? ""),
      );
      context.setRaw(smallPool);

      await expect(context.service.refresh({ taskId: "pool-small" })).rejects.toMatchObject({
        code: "POOL_CHANGE_GUARD",
      });

      context.advanceClock();
      const forced = await context.service.refresh({
        taskId: "pool-forced",
        forcePoolChange: true,
      });
      expect(forced.master.items).toHaveLength(3);
      expect(forced.master.poolVersion).toBe(2);
    } finally {
      await context.fixture.cleanup();
    }
  });
});
