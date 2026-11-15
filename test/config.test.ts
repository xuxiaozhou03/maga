import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  categoriesConfigSchema,
  categoryMappingSchema,
  categoryOverridesSchema,
  categorySuggestionsSchema,
  sourceConfigSchema,
} from "../src/config/schemas.js";

async function readJson(relativePath: string): Promise<unknown> {
  const path = new URL(`../data/config/${relativePath}`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("configuration contracts", () => {
  it("validates the source configuration and fixed units", async () => {
    const config = sourceConfigSchema.parse(await readJson("source-config.json"));

    expect(config.baseUrl).toBe("https://hongsehuojian.com");
    expect(config.etfPageSize).toBe(2000);
    expect(config.percentileScale).toBe("percent");
    expect(config.premiumRateScale).toBe("percent");
    expect(config.changePercentScale).toBe("percent");
  });

  it("contains exactly six primary categories with unique codes", async () => {
    const config = categoriesConfigSchema.parse(await readJson("categories.json"));

    expect(config.categories.map((category) => category.code)).toEqual([
      "broad_market",
      "industry",
      "theme",
      "strategy",
      "commodity",
      "other_asset",
    ]);

    const secondaryCodes = config.categories.flatMap((category) =>
      category.children.map((child) => child.code),
    );
    expect(new Set(secondaryCodes).size).toBe(secondaryCodes.length);
  });

  it("loads a pending-only mapping without blocking calculation", async () => {
    const mapping = categoryMappingSchema.parse(await readJson("etf-category-mapping.json"));
    const overrides = categoryOverridesSchema.parse(await readJson("category-overrides.json"));
    const suggestions = categorySuggestionsSchema.parse(
      await readJson("category-suggestions.json"),
    );

    expect(mapping.items.every((item) => item.status === "pending")).toBe(true);
    expect(mapping.items.every((item) => item.primaryCode === null)).toBe(true);
    expect(overrides.items).toEqual([]);
    expect(suggestions.items).toEqual([]);
  });

  it("rejects a confirmed mapping without both category levels", () => {
    const parse = () =>
      categoryMappingSchema.parse({
        schemaVersion: 1,
        version: 1,
        updatedAt: "2026-11-15T00:00:00.000Z",
        items: [
          {
            etfCode: "510300.SH",
            primaryCode: "broad_market",
            secondaryCode: null,
            status: "confirmed",
            reason: "invalid test",
            confidence: 1,
            updatedAt: "2026-11-15T00:00:00.000Z",
          },
        ],
      });

    expect(parse).toThrow();
  });
});
