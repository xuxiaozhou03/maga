import { DataError } from "./errors.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function canonicalize(value: unknown): JsonValue {
  return canonicalizeValue(value, "$", new WeakSet<object>());
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function parseJsonText(text: string): unknown {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return JSON.parse(normalized) as unknown;
  } catch (error) {
    throw new DataError({
      code: "DATA_CORRUPT",
      message: "JSON parse failed",
      cause: error,
    });
  }
}

function canonicalizeValue(value: unknown, path: string, ancestors: WeakSet<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw invalidValue(path, "non-finite number");
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw invalidValue(path, "circular reference");
    }
    ancestors.add(value);
    const result = value.map((item, index) =>
      canonicalizeValue(item, `${path}[${index}]`, ancestors),
    );
    ancestors.delete(value);
    return result;
  }

  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalidValue(path, "non-plain object");
    }
    if (ancestors.has(value)) {
      throw invalidValue(path, "circular reference");
    }

    ancestors.add(value);
    const source = value as Record<string, unknown>;
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      const item = source[key];
      if (item === undefined) {
        throw invalidValue(`${path}.${key}`, "undefined value");
      }
      result[key] = canonicalizeValue(item, `${path}.${key}`, ancestors);
    }
    ancestors.delete(value);
    return result;
  }

  throw invalidValue(path, `unsupported value type: ${typeof value}`);
}

function invalidValue(path: string, reason: string): DataError {
  return new DataError({
    code: "INVALID_JSON",
    message: `Cannot serialize JSON at ${path}: ${reason}`,
    context: { path, reason },
  });
}
