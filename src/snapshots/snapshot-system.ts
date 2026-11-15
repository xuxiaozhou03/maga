import {
  currentPointerSchema,
  snapshotIndexSchema,
  type CurrentPointer,
  type SnapshotIndex,
  type SnapshotManifest,
} from "../domain/snapshot.js";
import type { DataPaths } from "../storage/data-paths.js";
import { JsonStore } from "../storage/json-store.js";
import { compareSnapshotDirectories, listPublishedSnapshotManifests } from "./repository.js";

export async function readCurrentPointer(
  paths: DataPaths,
  store: JsonStore,
): Promise<CurrentPointer | null> {
  return store.read(paths.currentPointerFile(), currentPointerSchema);
}

export async function buildSnapshotIndex(
  paths: DataPaths,
  store: JsonStore,
  updatedAt: string,
): Promise<SnapshotIndex> {
  const manifests = await listPublishedSnapshotManifests(paths, store);
  return buildSnapshotIndexFromManifests(
    manifests.map((item) => item.manifest),
    updatedAt,
  );
}

export function buildSnapshotIndexFromManifests(
  manifests: readonly SnapshotManifest[],
  updatedAt: string,
): SnapshotIndex {
  const byDate = new Map<string, SnapshotManifest[]>();
  for (const manifest of manifests) {
    const versions = byDate.get(manifest.analysisDate) ?? [];
    versions.push(manifest);
    byDate.set(manifest.analysisDate, versions);
  }

  const dates = [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([analysisDate, versions]) => {
      const entries = versions
        .sort((left, right) => left.snapshotVersion - right.snapshotVersion)
        .map((manifest) => ({
          version: manifest.snapshotVersion,
          status: "published" as const,
          publishedAt: manifest.publishedAt ?? manifest.createdAt,
        }));
      return {
        analysisDate,
        latestVersion: entries.at(-1)?.version ?? 1,
        versions: entries,
      };
    });

  return snapshotIndexSchema.parse({ schemaVersion: 1, updatedAt, dates });
}

export async function writeSnapshotIndex(
  paths: DataPaths,
  store: JsonStore,
  index: SnapshotIndex,
): Promise<void> {
  await store.writeAtomic(paths.snapshotIndexFile(), index, snapshotIndexSchema);
}

export async function addManifestToSnapshotIndex(
  paths: DataPaths,
  store: JsonStore,
  manifest: SnapshotManifest,
  updatedAt: string,
): Promise<SnapshotIndex> {
  const current = await store.read(paths.snapshotIndexFile(), snapshotIndexSchema);
  if (current === null) {
    const index = await buildSnapshotIndex(paths, store, updatedAt);
    await writeSnapshotIndex(paths, store, index);
    return index;
  }

  const dates = current.dates.map((date) => ({
    ...date,
    versions: [...date.versions],
  }));
  let dateEntry = dates.find((date) => date.analysisDate === manifest.analysisDate);
  if (dateEntry === undefined) {
    dateEntry = { analysisDate: manifest.analysisDate, latestVersion: 0, versions: [] };
    dates.push(dateEntry);
  }
  const publishedAt = manifest.publishedAt ?? updatedAt;
  if (!dateEntry.versions.some((entry) => entry.version === manifest.snapshotVersion)) {
    dateEntry.versions.push({
      version: manifest.snapshotVersion,
      status: "published",
      publishedAt,
    });
  }
  dateEntry.versions.sort((left, right) => left.version - right.version);
  dateEntry.latestVersion = dateEntry.versions.at(-1)?.version ?? manifest.snapshotVersion;
  dates.sort((left, right) => left.analysisDate.localeCompare(right.analysisDate));

  const index = snapshotIndexSchema.parse({ schemaVersion: 1, updatedAt, dates });
  await writeSnapshotIndex(paths, store, index);
  return index;
}

export async function advanceCurrentPointer(
  paths: DataPaths,
  store: JsonStore,
  manifest: SnapshotManifest,
  updatedAt: string,
): Promise<{ pointer: CurrentPointer; advanced: boolean }> {
  const current = await readCurrentPointer(paths, store);
  const shouldAdvance =
    current === null ||
    manifest.analysisDate > current.analysisDate ||
    (manifest.analysisDate === current.analysisDate &&
      manifest.snapshotVersion > current.snapshotVersion);
  if (!shouldAdvance) {
    return {
      pointer:
        current ??
        currentPointerSchema.parse({
          schemaVersion: 1,
          analysisDate: manifest.analysisDate,
          snapshotVersion: manifest.snapshotVersion,
          snapshotPath: paths.snapshotVersionPath(manifest.analysisDate, manifest.snapshotVersion),
          updatedAt,
        }),
      advanced: false,
    };
  }

  const pointer = currentPointerSchema.parse({
    schemaVersion: 1,
    analysisDate: manifest.analysisDate,
    snapshotVersion: manifest.snapshotVersion,
    snapshotPath: paths.snapshotVersionPath(manifest.analysisDate, manifest.snapshotVersion),
    updatedAt,
  });
  await writeCurrentPointer(paths, store, pointer);
  return { pointer, advanced: true };
}

export async function writeCurrentPointer(
  paths: DataPaths,
  store: JsonStore,
  pointer: CurrentPointer,
): Promise<void> {
  await store.writeAtomic(paths.currentPointerFile(), pointer, currentPointerSchema);
}

export async function latestPublishedPair(
  paths: DataPaths,
  store: JsonStore,
): Promise<{ analysisDate: string; version: number } | null> {
  const manifests = await listPublishedSnapshotManifests(paths, store);
  const latest = manifests.at(-1);
  if (latest === undefined) {
    return null;
  }
  return {
    analysisDate: latest.manifest.analysisDate,
    version: latest.manifest.snapshotVersion,
  };
}

export function isCurrentPointerAtOrAhead(
  current: Pick<CurrentPointer, "analysisDate" | "snapshotVersion">,
  manifest: Pick<SnapshotManifest, "analysisDate" | "snapshotVersion">,
): boolean {
  return (
    current.analysisDate > manifest.analysisDate ||
    (current.analysisDate === manifest.analysisDate &&
      current.snapshotVersion >= manifest.snapshotVersion)
  );
}

export async function latestValidPublishedManifest(
  paths: DataPaths,
  store: JsonStore,
  isValid: (manifest: SnapshotManifest) => Promise<boolean>,
): Promise<SnapshotManifest | null> {
  const manifests = await listPublishedSnapshotManifests(paths, store);
  for (const item of [...manifests].sort((left, right) =>
    compareSnapshotDirectories(right.directory, left.directory),
  )) {
    if (await isValid(item.manifest)) {
      return item.manifest;
    }
  }
  return null;
}
