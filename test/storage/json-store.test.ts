import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { JsonStore } from "../../src/storage/json-store.js";
import { createTempDataRoot } from "./support.js";

const documentSchema = z.object({
  value: z.number().int(),
  payload: z.string(),
});

describe("JsonStore", () => {
  it("writes and reads schema-validated JSON atomically", async () => {
    const fixture = await createTempDataRoot();
    try {
      const store = new JsonStore(fixture.paths);
      const data = { value: 7, payload: "complete" };

      await store.writeAtomic("master/test.json", data, documentSchema);

      await expect(store.read("master/test.json", documentSchema)).resolves.toEqual(data);
      await expect(store.exists("master/test.json")).resolves.toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects schema-invalid and non-finite values without writing a target file", async () => {
    const fixture = await createTempDataRoot();
    try {
      const store = new JsonStore(fixture.paths);
      const invalidDocument = { value: "wrong", payload: "x" } as unknown as z.infer<
        typeof documentSchema
      >;

      await expect(
        store.writeAtomic("master/invalid.json", invalidDocument, documentSchema),
      ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
      await expect(
        store.writeAtomic("master/nan.json", { value: Number.NaN }, z.unknown()),
      ).rejects.toMatchObject({ code: "INVALID_JSON" });

      await expect(store.exists("master/invalid.json")).resolves.toBe(false);
      await expect(store.exists("master/nan.json")).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("supports explicit no-overwrite writes", async () => {
    const fixture = await createTempDataRoot();
    try {
      const store = new JsonStore(fixture.paths);
      await store.writeAtomic("master/test.json", { value: 1, payload: "one" }, documentSchema);

      await expect(
        store.writeAtomic("master/test.json", { value: 2, payload: "two" }, documentSchema, {
          overwrite: false,
        }),
      ).rejects.toMatchObject({ code: "WRITE_FAILED" });

      await expect(store.read("master/test.json", documentSchema)).resolves.toEqual({
        value: 1,
        payload: "one",
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps the previous file intact when a crash occurs before rename", async () => {
    const fixture = await createTempDataRoot();
    try {
      const baselineStore = new JsonStore(fixture.paths);
      await baselineStore.writeAtomic(
        "master/test.json",
        { value: 1, payload: "stable" },
        documentSchema,
      );

      const crashingStore = new JsonStore(fixture.paths, {
        hooks: {
          beforeRename: () => {
            throw new Error("simulated process crash before rename");
          },
        },
      });

      await expect(
        crashingStore.writeAtomic(
          "master/test.json",
          { value: 2, payload: "uncommitted" },
          documentSchema,
        ),
      ).rejects.toMatchObject({ code: "WRITE_FAILED" });

      await expect(baselineStore.read("master/test.json", documentSchema)).resolves.toEqual({
        value: 1,
        payload: "stable",
      });
      expect((await baselineStore.list("master")).filter((name) => name.endsWith(".tmp"))).toEqual(
        [],
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("never exposes a partially written file during concurrent writes", async () => {
    const fixture = await createTempDataRoot();
    try {
      const store = new JsonStore(fixture.paths);
      const schema = z.object({
        value: z.number().int(),
        items: z.array(z.number()),
      });
      const payload = Array.from({ length: 500 }, (_, index) => index);
      await store.writeAtomic("master/concurrent.json", { value: 0, items: payload }, schema);

      let reading = true;
      let readCount = 0;
      const reader = (async () => {
        while (reading) {
          const current = await store.read("master/concurrent.json", schema);
          if (current) {
            expect(current.items).toHaveLength(payload.length);
            expect(Number.isInteger(current.value)).toBe(true);
            readCount += 1;
          }
          await new Promise((resolve) => setImmediate(resolve));
        }
      })();

      await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          store.writeAtomic("master/concurrent.json", { value: index + 1, items: payload }, schema),
        ),
      );
      reading = false;
      await reader;

      expect(readCount).toBeGreaterThan(0);
      await expect(store.read("master/concurrent.json", schema)).resolves.toMatchObject({
        items: payload,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns null for a missing file and lists directory entries", async () => {
    const fixture = await createTempDataRoot();
    try {
      const store = new JsonStore(fixture.paths);
      await expect(store.read("master/missing.json", documentSchema)).resolves.toBeNull();
      await store.writeAtomic("master/a.json", { value: 1, payload: "a" }, documentSchema);
      await store.writeAtomic("master/b.json", { value: 2, payload: "b" }, documentSchema);

      await expect(store.list("master")).resolves.toEqual(["a.json", "b.json"]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("updates a file through the atomic read-modify-write helper", async () => {
    const fixture = await createTempDataRoot();
    try {
      const store = new JsonStore(fixture.paths);
      await store.writeAtomic("master/counter.json", { value: 1, payload: "one" }, documentSchema);

      const updated = await store.updateAtomic(
        "master/counter.json",
        documentSchema,
        (current) => ({
          value: (current?.value ?? 0) + 1,
          payload: "updated",
        }),
      );

      expect(updated).toEqual({ value: 2, payload: "updated" });
      await expect(store.read("master/counter.json", documentSchema)).resolves.toEqual(updated);
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports malformed JSON and schema mismatches as DATA_CORRUPT", async () => {
    const fixture = await createTempDataRoot();
    try {
      const store = new JsonStore(fixture.paths);
      await writeFile(join(fixture.root, "master", "broken.json"), '{"value":', "utf8");
      await writeFile(
        join(fixture.root, "master", "wrong-schema.json"),
        JSON.stringify({ value: "wrong", payload: "x" }),
        "utf8",
      );

      await expect(store.read("master/broken.json", documentSchema)).rejects.toMatchObject({
        code: "DATA_CORRUPT",
      });
      await expect(store.read("master/wrong-schema.json", documentSchema)).rejects.toMatchObject({
        code: "DATA_CORRUPT",
      });
    } finally {
      await fixture.cleanup();
    }
  });
});
