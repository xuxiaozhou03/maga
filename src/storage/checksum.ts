import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { canonicalJson } from "./canonical-json.js";

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256Json(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function checksumJson(value: unknown): string {
  return `sha256:${sha256Json(value)}`;
}

export async function sha256File(path: string): Promise<string> {
  return sha256(await readFile(path));
}
