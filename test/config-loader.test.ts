import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigLoader } from "../src/config/loader.js";
import { canonicalJson } from "../src/storage/canonical-json.js";

const realConfigDirectory = resolve(process.cwd(), "data/config");

describe("ConfigLoader", () => {
  it("loads and validates every configuration file", async () => {
    const loader = await ConfigLoader.create(resolve(process.cwd(), "data"));
    const config = await loader.loadAll();

    expect(config.categories.categories).toHaveLength(6);
    expect(config.source.baseUrl).toBe("https://hongsehuojian.com");
    expect(config.calculation.algorithmVersion).toBe("0.5.1");
    expect(config.rules.rules.length).toBeGreaterThan(0);
    expect(config.configHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("produces a stable config hash", async () => {
    const loader = await ConfigLoader.create(resolve(process.cwd(), "data"));

    const first = await loader.loadAll();
    const second = await loader.loadAll();

    expect(first.configHash).toBe(second.configHash);
  });

  it("rejects category mappings that reference an unknown secondary code", async () => {
    const root = await mkdtemp(join(tmpdir(), "maga-config-test-"));
    try {
      await cp(realConfigDirectory, join(root, "config"), { recursive: true });
      const mappingPath = join(root, "config", "etf-category-mapping.json");
      const mapping = JSON.parse(await readFile(mappingPath, "utf8")) as Record<string, unknown>;
      mapping.items = [
        {
          etfCode: "510300.SH",
          primaryCode: "broad_market",
          secondaryCode: "not_a_real_child",
          status: "confirmed",
          reason: "invalid fixture",
          confidence: 1,
          updatedAt: "2026-11-15T00:00:00.000Z",
        },
      ];
      await writeFile(mappingPath, canonicalJson(mapping), "utf8");

      const loader = await ConfigLoader.create(root);
      await expect(loader.loadAll()).rejects.toMatchObject({ code: "CONFIG_INVALID" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
