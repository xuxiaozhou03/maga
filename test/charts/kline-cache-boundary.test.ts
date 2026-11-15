import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(process.cwd(), "src");
const ALLOWED_PREFIXES = ["src/charts/", "src/server/", "src/storage/data-paths.ts"];
const CACHE_REFERENCE = /kline-cache-service|KlineCacheService|cache\/klines/;

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(path);
      }
      return extname(entry.name) === ".ts" ? [path] : [];
    }),
  );
  return nested.flat();
}

describe("Kline cache dependency boundary", () => {
  it("is referenced only by chart-facing modules", async () => {
    const files = await listTypeScriptFiles(SOURCE_ROOT);
    const violations: string[] = [];

    for (const file of files) {
      const relativePath = relative(process.cwd(), file).split("\\").join("/");
      if (
        ALLOWED_PREFIXES.some(
          (prefix) => relativePath === prefix || relativePath.startsWith(prefix),
        )
      ) {
        continue;
      }
      if (CACHE_REFERENCE.test(await readFile(file, "utf8"))) {
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);
  });
});
