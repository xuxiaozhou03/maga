import { describe, expect, it } from "vitest";
import { HttpClient } from "../../src/sources/http.js";
import { CapturingLogger, makeSourceConfig } from "./support.js";

describe("HttpClient rate limiting", () => {
  it("never exceeds the configured concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const client = new HttpClient(makeSourceConfig({ concurrency: 2, minIntervalMs: 0 }), {
      logger: new CapturingLogger(),
      fetchImpl: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return new Response(JSON.stringify({ code: "200" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await Promise.all([
      client.getJson("/one", {}, { label: "one" }),
      client.getJson("/two", {}, { label: "two" }),
      client.getJson("/three", {}, { label: "three" }),
    ]);

    expect(maxActive).toBe(2);
  });
});
