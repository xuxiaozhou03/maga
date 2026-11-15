import { rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { KlineCacheService, type DailyKlineSource } from "../../src/charts/kline-cache-service.js";
import { KlineChartService } from "../../src/charts/kline-chart-service.js";
import { klineCacheFileSchema } from "../../src/domain/kline.js";
import type { Kline } from "../../src/sources/types.js";
import { JsonStore } from "../../src/storage/json-store.js";
import { createTempDataRoot } from "../storage/support.js";

const CODE = "510300.SH";

function kline(date: string, close: number, amount: number | null = 1_000): Kline {
  return {
    code: CODE,
    date,
    open: close - 0.1,
    high: close + 0.2,
    low: close - 0.2,
    close,
    volume: 100,
    amount,
    change: 0.1,
    changePercent: 0.001,
  };
}

class StubKlineSource implements DailyKlineSource {
  calls = 0;

  constructor(private readonly rows: Kline[]) {}

  async fetchDaily(_code: string, _endDate: string, limit: number): Promise<Kline[]> {
    this.calls += 1;
    return this.rows.slice(-limit);
  }
}

async function setup(maxRows?: number) {
  const fixture = await createTempDataRoot();
  const store = new JsonStore(fixture.paths);
  const cache = new KlineCacheService(store, fixture.paths, {
    now: () => new Date("2026-11-15T08:00:00.000Z"),
    ...(maxRows === undefined ? {} : { maxRows }),
  });
  return { fixture, store, cache };
}

describe("KlineCacheService", () => {
  it("writes canonical chart rows and reads them back", async () => {
    const context = await setup();
    try {
      const written = await context.cache.write(CODE, [kline("2026-11-13", 4.083)], {
        analysisDate: "2026-11-15",
        updatedAt: "2026-11-15T08:00:00.000Z",
      });

      expect(written).toEqual({
        code: CODE,
        updatedAt: "2026-11-15T08:00:00.000Z",
        source: "hongsehuojian",
        adjust: 1,
        rows: [
          {
            date: "2026-11-13",
            open: 3.983,
            high: 4.283,
            low: 3.883,
            close: 4.083,
            volume: 100,
            amount: 1_000,
          },
        ],
      });
      await expect(context.cache.read(CODE)).resolves.toEqual(written);
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("truncates the oldest rows to the 1000-row cache limit", async () => {
    const context = await setup();
    try {
      const rows = Array.from({ length: 1_005 }, (_, index) => {
        const date = new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10);
        return kline(date, 1 + index / 10_000);
      });
      const written = await context.cache.write(CODE, rows, {
        analysisDate: rows.at(-1)!.date,
        updatedAt: "2026-11-15T08:00:00.000Z",
      });

      expect(written.rows).toHaveLength(1_000);
      expect(written.rows[0]?.date).toBe(rows[5]?.date);
      expect(written.rows.at(-1)?.date).toBe(rows.at(-1)?.date);
      const stored = await context.store.read(
        context.fixture.paths.klineCacheFile(CODE),
        klineCacheFileSchema,
      );
      expect(stored?.rows).toHaveLength(1_000);
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("rejects future rows and filters cache reads for a historical analysis date", async () => {
    const context = await setup();
    try {
      await expect(
        context.cache.write(CODE, [kline("2026-11-16", 4.1)], {
          analysisDate: "2026-11-15",
          updatedAt: "2026-11-15T08:00:00.000Z",
        }),
      ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });

      const cache = {
        code: CODE,
        updatedAt: "2026-11-15T08:00:00.000Z",
        source: "hongsehuojian" as const,
        adjust: 1 as const,
        rows: [
          {
            date: "2026-11-13",
            open: 4,
            high: 4.2,
            low: 3.9,
            close: 4.1,
            volume: 100,
            amount: 1_000,
          },
          {
            date: "2026-11-16",
            open: 4.1,
            high: 4.3,
            low: 4,
            close: 4.2,
            volume: 110,
            amount: 1_100,
          },
        ],
      };
      await context.store.writeAtomic(
        context.fixture.paths.klineCacheFile(CODE),
        cache,
        klineCacheFileSchema,
      );

      const historical = await context.cache.read(CODE, "2026-11-13");
      expect(historical?.rows.map((row) => row.date)).toEqual(["2026-11-13"]);
    } finally {
      await context.fixture.cleanup();
    }
  });

  it("rebuilds a deleted cache through the chart service", async () => {
    const context = await setup();
    try {
      const source = new StubKlineSource([kline("2026-11-12", 4.145), kline("2026-11-13", 4.083)]);
      const charts = new KlineChartService(context.cache);

      const first = await charts.getChart(CODE, {
        period: "day",
        analysisDate: "2026-11-15",
        limit: 250,
        source,
      });
      expect(first.map((row) => row.date)).toEqual(["2026-11-12", "2026-11-13"]);
      expect(source.calls).toBe(1);

      await rm(await context.fixture.paths.resolveSafe(context.fixture.paths.klineCacheFile(CODE)));
      await expect(context.cache.read(CODE)).resolves.toBeNull();

      const rebuilt = await charts.getChart(CODE, {
        period: "week",
        analysisDate: "2026-11-15",
        limit: 250,
        source,
      });
      expect(rebuilt).toHaveLength(1);
      expect(source.calls).toBe(2);
      await expect(context.cache.read(CODE)).resolves.not.toBeNull();
    } finally {
      await context.fixture.cleanup();
    }
  });
});
