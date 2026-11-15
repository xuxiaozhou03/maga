import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ValuationSource } from "../../src/sources/valuation-source.js";
import type { ValuationType } from "../../src/sources/types.js";
import { CapturingLogger, StubHttpClient, httpResult, makeSourceConfig } from "./support.js";

async function readFixture(name: string): Promise<unknown> {
  const path = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("ValuationSource", () => {
  it("parses PE history without normalizing the percentile", async () => {
    const body = await readFixture("valuation.json");
    const http = new StubHttpClient(() => httpResult(body));
    const source = new ValuationSource(http, makeSourceConfig());

    const items = await source.fetch("000300.SH", "PE");

    expect(items[0]).toEqual({
      tradeDate: "20261113",
      valuationValue: 13.4199,
      historicalPercentile: 73.76,
      peg: -40.9339,
    });
    expect(http.calls[0]?.params).toMatchObject({
      securityCode: "000300.SH",
      valuationType: "PE",
      timeInterval: "last_5_years",
    });
  });

  it("treats data={} as an unsupported index/type, not a failure", async () => {
    const body = await readFixture("valuation-empty.json");
    const http = new StubHttpClient(() => httpResult(body));
    const source = new ValuationSource(http, makeSourceConfig());

    await expect(source.fetch("NDX.GI", "PE")).resolves.toEqual([]);
  });

  it("ignores malformed rows and keeps valid ones", async () => {
    const logger = new CapturingLogger();
    const http = new StubHttpClient(() =>
      httpResult({
        code: "200",
        data: {
          items: [
            {
              tradeDate: "20261113",
              valuationValue: 13.4199,
              historicalPercentile: 73.76,
              peg: null,
            },
            { tradeDate: "20261112", valuationValue: "not-a-number" },
          ],
        },
      }),
    );
    const source = new ValuationSource(http, makeSourceConfig(), logger);

    const items = await source.fetch("000300.SH", "PE");

    expect(items).toHaveLength(1);
    expect(logger.entries.some((entry) => entry.context.event === "valuation_invalid_items")).toBe(
      true,
    );
  });

  it("rejects a non-success business code", async () => {
    const http = new StubHttpClient(() => httpResult({ code: "500", msg: "failed", data: {} }));
    const source = new ValuationSource(http, makeSourceConfig());

    await expect(source.fetch("000300.SH", "PE")).rejects.toMatchObject({
      code: "SOURCE_BUSINESS",
    });
  });

  it("rejects the legacy DID valuation type", async () => {
    const http = new StubHttpClient(() => httpResult({ code: "200", data: {} }));
    const source = new ValuationSource(http, makeSourceConfig());

    await expect(source.fetch("000300.SH", "DID" as ValuationType)).rejects.toMatchObject({
      code: "SOURCE_UNSUPPORTED",
    });
  });
});
