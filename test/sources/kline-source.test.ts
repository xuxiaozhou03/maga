import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { KlineSource, parseKlineItems } from "../../src/sources/kline-source.js";
import { CapturingLogger, StubHttpClient, httpResult, makeSourceConfig } from "./support.js";

async function readFixture(name: string): Promise<unknown> {
  const path = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("KlineSource", () => {
  it("requests front-adjusted daily bars and normalizes percent values", async () => {
    const body = await readFixture("kline.json");
    const http = new StubHttpClient(() => httpResult(body));
    const source = new KlineSource(http, makeSourceConfig());

    const bars = await source.fetchDaily("510300.SH", "2026-11-15", 2);

    expect(http.calls[0]?.params).toMatchObject({
      securityCode: "510300.SH",
      count: -2,
      begin: "20261115",
      period: "day",
      adjust: 1,
    });
    expect(bars).toHaveLength(2);
    expect(bars.at(-1)).toMatchObject({
      date: "2026-11-13",
      close: 4.083,
      changePercent: -0.015,
      amount: 3489035700,
    });
  });

  it("sorts rows, keeps the last duplicate date, and drops invalid rows", async () => {
    const body = (await readFixture("kline-messy.json")) as {
      data: { columns: string; items: string };
    };
    const logger = new CapturingLogger();

    const bars = parseKlineItems({
      code: "510300.SH",
      columns: body.data.columns,
      items: body.data.items,
      endDate: "2026-11-15",
      limit: 10,
      changePercentScale: "percent",
      logger,
    });

    expect(bars.map((bar) => bar.date)).toEqual(["2026-11-12", "2026-11-13"]);
    expect(bars.at(-1)).toMatchObject({ close: 4.084, changePercent: -0.012 });
    expect(logger.entries.map((entry) => entry.context.event)).toEqual(
      expect.arrayContaining(["kline_invalid_rows", "kline_duplicate_dates", "kline_out_of_order"]),
    );
  });

  it("treats empty items as an empty result", async () => {
    const http = new StubHttpClient(() =>
      httpResult({
        code: "200",
        data: {
          columns: "week,tradeDate,open,high,low,close,volume,amount,change,changePercent",
          items: "",
        },
      }),
    );
    const source = new KlineSource(http, makeSourceConfig());

    await expect(source.fetchDaily("510300.SH", "2026-11-15", 10)).resolves.toEqual([]);
  });

  it("drops rows with non-positive prices, invalid ranges, or negative volume/amount", () => {
    const logger = new CapturingLogger();
    const bars = parseKlineItems({
      code: "510300.SH",
      columns: "week,tradeDate,open,high,low,close,volume,amount,change,changePercent",
      items: [
        "星期五,2026-11-06,0,4.1,3.9,4,100,1000,0,0",
        "星期五,2026-11-09,4,4.1,3.9,4,100,1000,0,0",
        "星期五,2026-11-10,4,3.8,3.9,3.95,100,1000,0,0",
        "星期五,2026-11-11,4,4.1,3.9,4,-1,1000,0,0",
        "星期五,2026-11-12,4,4.1,3.9,4,100,-1,0,0",
        "星期五,2026-11-13,4,4.1,3.9,4,100,1000,0,0",
      ].join(";"),
      endDate: "2026-11-15",
      limit: 10,
      changePercentScale: "percent",
      logger,
    });

    expect(bars.map((bar) => bar.date)).toEqual(["2026-11-09", "2026-11-13"]);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        context: expect.objectContaining({ event: "kline_invalid_rows", invalidRows: 4 }),
      }),
    );
  });

  it("rejects a response missing a required column", () => {
    expect(() =>
      parseKlineItems({
        code: "510300.SH",
        columns: "tradeDate,close",
        items: "2026-11-13,4.083",
        endDate: "2026-11-15",
        limit: 10,
        changePercentScale: "percent",
      }),
    ).toThrow(expect.objectContaining({ code: "SOURCE_PAYLOAD" }));
  });

  it("rejects a bare ETF code before making a request", async () => {
    const http = new StubHttpClient(() => httpResult({}));
    const source = new KlineSource(http, makeSourceConfig());

    await expect(source.fetchDaily("510300", "2026-11-15", 10)).rejects.toMatchObject({
      code: "SOURCE_PAYLOAD",
    });
    expect(http.calls).toHaveLength(0);
  });
});
