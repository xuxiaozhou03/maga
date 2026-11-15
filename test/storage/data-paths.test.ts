import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_DIRECTORIES } from "../../src/storage/data-paths.js";
import { createTempDataRoot } from "./support.js";

describe("DataPaths", () => {
  it("creates the complete data layout", async () => {
    const fixture = await createTempDataRoot();
    try {
      for (const directory of DATA_DIRECTORIES) {
        expect(await fixture.paths.list(directory)).toEqual([]);
      }
    } finally {
      await fixture.cleanup();
    }
  });

  it.each(["../outside.json", "/tmp/outside.json", "master/../../outside.json"])(
    "rejects unsafe path %s",
    async (path) => {
      const fixture = await createTempDataRoot();
      try {
        await expect(fixture.paths.resolveSafe(path)).rejects.toMatchObject({
          code: "PATH_ESCAPE",
        });
      } finally {
        await fixture.cleanup();
      }
    },
  );

  it("rejects a path that resolves through a symbolic link outside the data root", async () => {
    const fixture = await createTempDataRoot();
    const outside = `${fixture.root}-outside`;
    try {
      await mkdir(outside, { recursive: true });
      await symlink(outside, join(fixture.root, "master", "external"), "dir");

      await expect(fixture.paths.resolveSafe("master/external/file.json")).rejects.toMatchObject({
        code: "PATH_ESCAPE",
      });
    } finally {
      await fixture.cleanup();
      await import("node:fs/promises").then(({ rm }) =>
        rm(outside, { recursive: true, force: true }),
      );
    }
  });
});
