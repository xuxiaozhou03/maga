import { describe, expect, it } from "vitest";
import { app } from "../src/server/app.js";

describe("health endpoint", () => {
  it("returns service metadata without touching upstream sources", async () => {
    const response = await app.request("/health");
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("maga");
    expect(body.version).toBe("0.5.1");
  });
});
