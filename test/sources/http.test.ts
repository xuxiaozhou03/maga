import { describe, expect, it } from "vitest";
import { HttpClient } from "../../src/sources/http.js";
import type { FetchLike } from "../../src/sources/types.js";
import { CapturingLogger, makeSourceConfig } from "./support.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HttpClient", () => {
  it("retries a 429 response and succeeds on the next attempt", async () => {
    let calls = 0;
    const logger = new CapturingLogger();
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return calls === 1 ? new Response(null, { status: 429 }) : jsonResponse({ code: "200" });
    };
    const client = new HttpClient(makeSourceConfig({ retries: 1, retryBaseDelayMs: 0 }), {
      fetchImpl,
      logger,
      sleep: async () => undefined,
      random: () => 0,
    });

    const result = await client.getJson("/example", {}, { label: "test" });

    expect(calls).toBe(2);
    expect(result.attempt).toBe(2);
    expect(logger.entries.some((entry) => entry.context.errorCode === "SOURCE_RATE_LIMIT")).toBe(
      true,
    );
  });

  it("does not retry a non-retryable 400 response", async () => {
    let calls = 0;
    const client = new HttpClient(makeSourceConfig({ retries: 3 }), {
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 400 });
      },
      sleep: async () => undefined,
    });

    await expect(client.getJson("/example", {}, { label: "test" })).rejects.toMatchObject({
      code: "SOURCE_HTTP",
      retryable: false,
      httpStatus: 400,
    });
    expect(calls).toBe(1);
  });

  it("classifies an aborted request as a timeout", async () => {
    const fetchImpl: FetchLike = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing abort signal"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          },
          { once: true },
        );
      });
    const client = new HttpClient(makeSourceConfig({ timeoutMs: 5, retries: 0 }), {
      fetchImpl,
      sleep: async () => undefined,
    });

    await expect(client.getJson("/example", {}, { label: "test" })).rejects.toMatchObject({
      code: "SOURCE_TIMEOUT",
      retryable: true,
    });
  });
});
