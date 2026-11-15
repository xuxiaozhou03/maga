import { describe, expect, it } from "vitest";
import { canonicalJson, parseJsonText } from "../../src/storage/canonical-json.js";
import { checksumJson, sha256Json } from "../../src/storage/checksum.js";

describe("canonical JSON", () => {
  it("sorts object keys recursively and writes a trailing newline", () => {
    const output = canonicalJson({ z: 1, a: { d: 2, c: 3 } });

    expect(output).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "z": 1\n}\n');
    expect(parseJsonText(output)).toEqual({ a: { c: 3, d: 2 }, z: 1 });
  });

  it.each([
    ["undefined", { value: undefined }],
    ["NaN", { value: Number.NaN }],
    ["Infinity", { value: Number.POSITIVE_INFINITY }],
    ["BigInt", { value: 1n }],
    ["function", { value: () => undefined }],
    ["Date", { value: new Date() }],
  ])("rejects %s values", (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(expect.objectContaining({ code: "INVALID_JSON" }));
  });

  it("rejects circular structures", () => {
    const value: Record<string, unknown> = {};
    value.self = value;

    expect(() => canonicalJson(value)).toThrow(expect.objectContaining({ code: "INVALID_JSON" }));
  });

  it("accepts a UTF-8 BOM when reading JSON text", () => {
    expect(parseJsonText('\ufeff{"value":1}')).toEqual({ value: 1 });
  });

  it("produces the same checksum regardless of insertion order", () => {
    const left = { b: 2, a: 1 };
    const right = { a: 1, b: 2 };

    expect(sha256Json(left)).toBe(sha256Json(right));
    expect(checksumJson(left)).toBe(`sha256:${sha256Json(right)}`);
  });
});
