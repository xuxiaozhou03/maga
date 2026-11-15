import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { EtfSource } from "../../src/sources/etf-source.js";
import { StubHttpClient, httpResult, makeSourceConfig } from "./support.js";

async function readFixture(name: string): Promise<unknown> {
  const path = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("EtfSource", () => {
  it("follows pagination until the upstream total is reached", async () => {
    const page1 = await readFixture("etf-list-page-1.json");
    const page2 = await readFixture("etf-list-page-2.json");
    const http = new StubHttpClient((_path, params) =>
      httpResult(params.pageNo === 1 ? page1 : page2),
    );
    const source = new EtfSource(http, makeSourceConfig({ etfPageSize: 2 }));

    const items = await source.fetchAll();

    expect(items.map((item) => item.securityCode)).toEqual(["510300.SH", "588000.SH", "159915.SZ"]);
    expect(http.calls.map((call) => call.params.pageNo)).toEqual([1, 2]);
    expect(http.calls[0]?.params.orderBy).toBe("l.scale");
  });

  it("keeps rows with missing optional identity fields for the selector to reject", async () => {
    const http = new StubHttpClient(() =>
      httpResult({
        code: "200",
        data: {
          total: 2,
          data: [
            { securityName: "missing code", securityCode: null, trackIndex: "000001.SH" },
            { securityName: "valid", securityCode: "510300.SH", trackIndex: "000300.SH" },
          ],
        },
      }),
    );
    const source = new EtfSource(http, makeSourceConfig());

    const items = await source.fetchAll();

    expect(items).toHaveLength(2);
    expect(items[0]?.securityCode).toBeNull();
  });

  it("rejects a non-success business code", async () => {
    const http = new StubHttpClient(() => httpResult({ code: "500", msg: "failed", data: {} }));
    const source = new EtfSource(http, makeSourceConfig());

    await expect(source.fetchAll()).rejects.toMatchObject({
      code: "SOURCE_BUSINESS",
      businessCode: "500",
    });
  });

  it("rejects a payload with a missing required envelope field", async () => {
    const http = new StubHttpClient(() => httpResult({ code: "200", data: { data: [] } }));
    const source = new EtfSource(http, makeSourceConfig());

    await expect(source.fetchAll()).rejects.toMatchObject({
      code: "SOURCE_PAYLOAD",
    });
  });
});
