import { describe, expect, it } from "vitest";
import { checksumJson } from "../../src/storage/checksum.js";
import { masterEtfFileSchema, type MasterEtfFile } from "../../src/domain/etf.js";
import { indexValuationFileSchema } from "../../src/domain/valuation.js";
import {
  ValuationService,
  extractUniqueIndexCodes,
  type ValuationSource,
} from "../../src/collectors/valuation-service.js";
import type { RawValuation } from "../../src/sources/types.js";
import { JsonStore } from "../../src/storage/json-store.js";
import { LockManager } from "../../src/storage/lock-manager.js";
import { createTempDataRoot } from "../storage/support.js";

const CODE = "000300.SH";
const OTHER_CODE = "000016.SH";

function raw(
  tradeDate: string,
  historicalPercentile: number | null,
  peg: number | null = null,
  valuationValue = 10,
): RawValuation {
  return { tradeDate, historicalPercentile, peg, valuationValue };
}

type Handler = (code: string, type: "PE" | "PB" | "PS") => Promise<RawValuation[]>;

class StubValuationSource implements ValuationSource {
  calls: Array<{ code: string; type: "PE" | "PB" | "PS" }> = [];
  handler: Handler;

  constructor(handler: Handler) {
    this.handler = handler;
  }

  fetch(code: string, type: "PE" | "PB" | "PS"): Promise<RawValuation[]> {
    this.calls.push({ code, type });
    return this.handler(code, type);
  }
}

async function setup(handler: Handler) {
  const fixture = await createTempDataRoot();
  const store = new JsonStore(fixture.paths);
  const locks = new LockManager(fixture.paths);
  const source = new StubValuationSource(handler);
  const service = new ValuationService(source, store, fixture.paths, locks, {
    now: () => new Date("2026-11-15T08:00:00.000Z"),
  });
  return { fixture, store, source, service };
}

async function readValuation(context: Awaited<ReturnType<typeof setup>>) {
  return context.store.read(
    context.fixture.paths.valuationIndexFile(CODE),
    indexValuationFileSchema,
  );
}

function allTypes(rows: RawValuation[]): Handler {
  return async () => rows;
}

describe("ValuationService", () => {
  it("normalizes and writes PE/PB/PS into one coverage-aware index file", async () => {
    const context = await setup(async (_code, type) => {
      if (type === "PE") {
        return [raw("20261113", 73.76, -40.9339, 13.4199)];
      }
      return [raw("20261113", 50, 1.25, type === "PB" ? 1.2 : 2.3)];
    });
    try {
      const result = await context.service.refreshIndexes([CODE], {
        analysisDate: "2026-11-15",
        taskId: "valuation-test",
      });
      const file = await readValuation(context);

      expect(result.indexes[0]).toMatchObject({ code: CODE, status: "updated", fileWritten: true });
      expect(file).toMatchObject({
        schemaVersion: 1,
        code: CODE,
        updatedAt: "2026-11-15T08:00:00.000Z",
        coverage: {
          PE: { supported: true, lastDate: "2026-11-13", count: 1 },
          PB: { supported: true, lastDate: "2026-11-13", count: 1 },
          PS: { supported: true, lastDate: "2026-11-13", count: 1 },
        },
      });
      expect(file?.items.find((item) => item.type === "PE")).toMatchObject({
        historicalPercentile: 0.7376,
        peg: -40.9339,
        pegUsable: false,
      });
      expect(file?.items.find((item) => item.type === "PB")).toMatchObject({
        peg: null,
        pegUsable: false,
      });
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("upserts new dates without dropping history that the upstream did not return", async () => {
    const context = await setup(allTypes([raw("20261112", 40)]));
    try {
      await context.service.refreshIndexes([CODE], { analysisDate: "2026-11-15" });
      context.source.handler = allTypes([raw("20261113", 73.76)]);
      await context.service.refreshIndexes([CODE], { analysisDate: "2026-11-15" });

      const file = await readValuation(context);
      expect(file?.items.filter((item) => item.type === "PE").map((item) => item.date)).toEqual([
        "2026-11-12",
        "2026-11-13",
      ]);
      expect(file?.coverage.PE).toEqual({
        supported: true,
        lastDate: "2026-11-13",
        count: 2,
      });
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("marks empty responses unsupported without deleting existing history", async () => {
    const context = await setup(allTypes([raw("20261112", 40)]));
    try {
      await context.service.refreshIndexes([CODE], { analysisDate: "2026-11-15" });
      context.source.handler = async (_code, type) => {
        if (type === "PE") {
          return [];
        }
        return [raw("20261113", 73.76)];
      };

      const result = await context.service.refreshIndexes([CODE], { analysisDate: "2026-11-15" });
      const file = await readValuation(context);

      expect(result.indexes[0]?.types.find((item) => item.type === "PE")?.status).toBe(
        "unsupported",
      );
      expect(file?.items.filter((item) => item.type === "PE")).toHaveLength(1);
      expect(file?.coverage.PE).toEqual({
        supported: false,
        lastDate: "2026-11-12",
        count: 1,
      });
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("isolates a failed type while updating other types", async () => {
    const context = await setup(allTypes([raw("20261112", 40)]));
    try {
      await context.service.refreshIndexes([CODE], { analysisDate: "2026-11-15" });
      context.source.handler = async (_code, type) => {
        if (type === "PE") {
          throw new Error("PE upstream failed");
        }
        if (type === "PS") {
          return [];
        }
        return [raw("20261113", 73.76)];
      };

      const result = await context.service.refreshIndexes([CODE], { analysisDate: "2026-11-15" });
      const file = await readValuation(context);

      expect(result.indexes[0]?.status).toBe("partial");
      expect(result.indexes[0]?.types.find((item) => item.type === "PE")?.status).toBe("failed");
      expect(file?.items.filter((item) => item.type === "PE")).toHaveLength(1);
      expect(file?.coverage.PE).toEqual({
        supported: true,
        lastDate: "2026-11-12",
        count: 1,
      });
      expect(file?.coverage.PB.lastDate).toBe("2026-11-13");
      expect(file?.coverage.PS.supported).toBe(false);
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("writes an unsupported marker when every type is empty", async () => {
    const context = await setup(async () => []);
    try {
      const result = await context.service.refreshIndexes([CODE], { analysisDate: "2026-11-15" });
      const file = await readValuation(context);

      expect(result.indexes[0]).toMatchObject({
        status: "unsupported",
        fileWritten: true,
      });
      expect(file?.items).toEqual([]);
      expect(Object.values(file?.coverage ?? {}).every((entry) => !entry.supported)).toBe(true);
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("extracts unique index codes from the research pool", async () => {
    const context = await setup(async () => []);
    try {
      const master = makeMaster([makeEtf("510300.SH", CODE), makeEtf("510050.SH", OTHER_CODE)]);
      await context.store.writeAtomic("master/etfs.json", master, masterEtfFileSchema);

      const result = await context.service.refreshFromMaster({ analysisDate: "2026-11-15" });

      expect(result.indexes.map((index) => index.code)).toEqual([OTHER_CODE, CODE]);
      expect(context.source.calls.map((call) => call.code)).toEqual([
        OTHER_CODE,
        OTHER_CODE,
        OTHER_CODE,
        CODE,
        CODE,
        CODE,
      ]);
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("deduplicates repeated track indexes defensively", () => {
    const master = makeMaster([makeEtf("510300.SH", CODE), makeEtf("159919.SZ", CODE)]);
    expect(extractUniqueIndexCodes(master)).toEqual([CODE]);
  });

  it("rejects an invalid analysis date before fetching", async () => {
    const context = await setup(async () => []);
    try {
      await expect(
        context.service.refreshIndexes([CODE], { analysisDate: "2026-02-30" }),
      ).rejects.toMatchObject({ code: "INVALID_ANALYSIS_DATE" });
      expect(context.source.calls).toHaveLength(0);
    } finally {
      await context.fixture.cleanup();
    }
  });
});

function makeEtf(code: string, trackIndex: string) {
  return {
    code,
    name: `ETF ${code}`,
    exchange: code.endsWith(".SH") ? ("SH" as const) : ("SZ" as const),
    scale: 1_000_000_000,
    trackingIndex: `指数 ${trackIndex}`,
    trackIndex,
    premiumRate: 0,
    amount: 10_000_000,
  };
}

function makeMaster(items: MasterEtfFile["items"]): MasterEtfFile {
  return {
    schemaVersion: 1,
    poolVersion: 1,
    poolHash: checksumJson(items),
    updatedAt: "2026-11-15T00:00:00.000Z",
    sourceFetchedAt: "2026-11-15T00:00:00.000Z",
    sourceTotal: items.length,
    items,
  };
}
