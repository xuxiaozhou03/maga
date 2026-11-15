import { readFile } from "node:fs/promises";
import type { ReportCitation } from "../domain/report.js";
import type { SnapshotReference } from "../snapshots/snapshot-reader.js";
import { parseJsonText, type JsonValue } from "../storage/canonical-json.js";
import type { DataPaths } from "../storage/data-paths.js";
import { ReportServiceError } from "./errors.js";

export interface VerifiedCitation extends ReportCitation {
  value: string | number | boolean | null;
}

export function isValidJsonPointer(pointer: string): boolean {
  if (pointer === "") {
    return true;
  }
  if (!pointer.startsWith("/")) {
    return false;
  }
  return /^(?:\/(?:[^~/]|~[01])*)+$/.test(pointer);
}

export function decodeJsonPointer(pointer: string): string[] {
  if (!isValidJsonPointer(pointer)) {
    throw invalidCitation(pointer, "Invalid JSON Pointer");
  }
  if (pointer === "") {
    return [];
  }
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

export function resolveJsonPointer(document: unknown, pointer: string): unknown {
  let current = document;
  for (const token of decodeJsonPointer(pointer)) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(token)) {
        return undefined;
      }
      current = current[Number(token)];
      continue;
    }
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(current, token)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

export async function verifyCitations(
  citations: readonly ReportCitation[],
  paths: DataPaths,
  snapshot: SnapshotReference,
): Promise<VerifiedCitation[]> {
  if (citations.length === 0) {
    throw invalidCitation("", "Reports require at least one citation");
  }

  const allowedPaths = new Set(snapshot.manifest.files.map((file) => file.path));
  const documents = new Map<string, JsonValue>();
  const verified: VerifiedCitation[] = [];

  for (const citation of citations) {
    if (!allowedPaths.has(citation.path)) {
      throw invalidCitation(
        citation.field,
        `Citation path is not part of snapshot ${snapshot.relativePath}: ${citation.path}`,
      );
    }

    let document = documents.get(citation.path);
    if (document === undefined) {
      const absolute = await paths.resolveSafe(`${snapshot.relativePath}/${citation.path}`);
      let text: string;
      try {
        text = await readFile(absolute, "utf8");
      } catch (error) {
        throw invalidCitation(
          citation.field,
          `Citation file is unreadable: ${citation.path}`,
          error,
        );
      }
      try {
        document = parseJsonText(text) as JsonValue;
      } catch (error) {
        throw invalidCitation(
          citation.field,
          `Citation file is invalid JSON: ${citation.path}`,
          error,
        );
      }
      documents.set(citation.path, document);
    }

    const value = resolveJsonPointer(document, citation.field);
    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw invalidCitation(
        citation.field,
        `Citation does not resolve to a scalar value: ${citation.path}#${citation.field}`,
      );
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw invalidCitation(citation.field, "Citation resolves to a non-finite number");
    }

    verified.push({ ...citation, value });
  }

  return verified;
}

export function citationKey(citation: ReportCitation): string {
  return `${citation.path}\u0000${citation.field}`;
}

export function uniqueCitations(citations: readonly ReportCitation[]): ReportCitation[] {
  const unique = new Map<string, ReportCitation>();
  for (const citation of citations) {
    unique.set(citationKey(citation), citation);
  }
  return [...unique.values()].sort((left, right) =>
    citationKey(left).localeCompare(citationKey(right)),
  );
}

function invalidCitation(field: string, message: string, cause?: unknown): ReportServiceError {
  return new ReportServiceError({
    code: "REPORT_CITATION_INVALID",
    message,
    retryable: false,
    context: { field },
    ...(cause === undefined ? {} : { cause }),
  });
}
