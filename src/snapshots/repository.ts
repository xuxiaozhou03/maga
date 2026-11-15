import { readdir } from "node:fs/promises";
import { isRealDate } from "../domain/date.js";
import { snapshotManifestSchema, type SnapshotManifest } from "../domain/snapshot.js";
import type { DataPaths } from "../storage/data-paths.js";
import type { JsonStore } from "../storage/json-store.js";

export interface SnapshotDirectory {
  analysisDate: string;
  version: number;
  relativePath: string;
}

export async function listSnapshotDirectories(paths: DataPaths): Promise<SnapshotDirectory[]> {
  const root = await paths.resolveSafe("snapshots");
  let dateEntries;
  try {
    dateEntries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error)) {
      return [];
    }
    throw error;
  }

  const result: SnapshotDirectory[] = [];
  for (const dateEntry of dateEntries) {
    if (!dateEntry.isDirectory() || !isRealDate(dateEntry.name)) {
      continue;
    }
    const dateRoot = await paths.resolveSafe(`snapshots/${dateEntry.name}`);
    for (const versionEntry of await readdir(dateRoot, { withFileTypes: true })) {
      const match = /^v(\d+)$/.exec(versionEntry.name);
      if (!versionEntry.isDirectory() || match === null) {
        continue;
      }
      const version = Number(match[1]);
      if (!Number.isInteger(version) || version <= 0) {
        continue;
      }
      result.push({
        analysisDate: dateEntry.name,
        version,
        relativePath: paths.snapshotVersionPath(dateEntry.name, version),
      });
    }
  }

  return result.sort(compareSnapshotDirectories);
}

export async function readSnapshotManifest(
  paths: DataPaths,
  store: JsonStore,
  directory: Pick<SnapshotDirectory, "relativePath">,
): Promise<SnapshotManifest | null> {
  return store.read(`${directory.relativePath}/manifest.json`, snapshotManifestSchema);
}

export async function listPublishedSnapshotManifests(
  paths: DataPaths,
  store: JsonStore,
): Promise<Array<{ directory: SnapshotDirectory; manifest: SnapshotManifest }>> {
  const result: Array<{ directory: SnapshotDirectory; manifest: SnapshotManifest }> = [];
  for (const directory of await listSnapshotDirectories(paths)) {
    try {
      const manifest = await readSnapshotManifest(paths, store, directory);
      if (manifest?.status === "published") {
        result.push({ directory, manifest });
      }
    } catch {
      // Corrupt manifests are reported by recovery and never become current.
    }
  }
  return result;
}

export async function latestVersionForDate(
  paths: DataPaths,
  store: JsonStore,
  analysisDate: string,
): Promise<number> {
  const manifests = await listPublishedSnapshotManifests(paths, store);
  return manifests
    .filter((item) => item.manifest.analysisDate === analysisDate)
    .reduce((max, item) => Math.max(max, item.manifest.snapshotVersion), 0);
}

export async function latestDirectoryVersionForDate(
  paths: DataPaths,
  analysisDate: string,
): Promise<number> {
  return (await listSnapshotDirectories(paths))
    .filter((item) => item.analysisDate === analysisDate)
    .reduce((max, item) => Math.max(max, item.version), 0);
}

export async function findPublishedSnapshotByFingerprint(
  paths: DataPaths,
  store: JsonStore,
  analysisDate: string,
  inputFingerprint: string,
): Promise<{ directory: SnapshotDirectory; manifest: SnapshotManifest } | null> {
  const manifests = await listPublishedSnapshotManifests(paths, store);
  return (
    manifests.find(
      (item) =>
        item.manifest.analysisDate === analysisDate &&
        item.manifest.inputFingerprint === inputFingerprint,
    ) ?? null
  );
}

export async function latestPublishedManifest(
  paths: DataPaths,
  store: JsonStore,
  beforeDate?: string,
): Promise<{ directory: SnapshotDirectory; manifest: SnapshotManifest } | null> {
  const manifests = (await listPublishedSnapshotManifests(paths, store)).filter(
    (item) => beforeDate === undefined || item.manifest.analysisDate < beforeDate,
  );
  return manifests.at(-1) ?? null;
}

export function compareSnapshotDirectories(
  left: Pick<SnapshotDirectory, "analysisDate" | "version">,
  right: Pick<SnapshotDirectory, "analysisDate" | "version">,
): number {
  const dateComparison = left.analysisDate.localeCompare(right.analysisDate);
  return dateComparison !== 0 ? dateComparison : left.version - right.version;
}

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
