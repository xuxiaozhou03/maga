import { lstat, readdir, rm, rmdir } from "node:fs/promises";
import { join } from "node:path";
import type { SnapshotManifest } from "../domain/snapshot.js";
import type { DataPaths } from "../storage/data-paths.js";
import type { JsonStore } from "../storage/json-store.js";
import { LockManager } from "../storage/lock-manager.js";
import { listSnapshotDirectories, type SnapshotDirectory } from "./repository.js";
import {
  buildSnapshotIndexFromManifests,
  writeCurrentPointer,
  readCurrentPointer,
  writeSnapshotIndex,
} from "./snapshot-system.js";
import { verifySnapshot } from "./snapshot-verifier.js";

export interface RecoveryOptions {
  now?: Date;
  tempMaxAgeMs?: number;
  staleLockMs?: number;
}

export interface InvalidSnapshotReport {
  relativePath: string;
  issues: string[];
}

export interface RecoveryReport {
  scannedSnapshots: number;
  validSnapshots: number;
  invalidSnapshots: InvalidSnapshotReport[];
  rebuiltIndex: boolean;
  currentRepaired: boolean;
  currentPath: string | null;
  cleanedTempEntries: number;
  cleanedStaleLocks: string[];
  warnings: string[];
}

export async function recoverSystem(
  paths: DataPaths,
  store: JsonStore,
  locks: LockManager,
  options: RecoveryOptions = {},
): Promise<RecoveryReport> {
  const now = options.now ?? new Date();
  const updatedAt = now.toISOString();
  const warnings: string[] = [];
  const cleanedTempEntries = await cleanupExpiredTemp(
    paths,
    now.getTime(),
    options.tempMaxAgeMs ?? 24 * 60 * 60_000,
  );

  const valid: Array<{ directory: SnapshotDirectory; manifest: SnapshotManifest }> = [];
  const invalidSnapshots: InvalidSnapshotReport[] = [];
  const directories = await listSnapshotDirectories(paths);
  for (const directory of directories) {
    const verification = await verifySnapshot(paths, store, directory.relativePath, {
      allowedStatuses: ["published"],
    });
    if (verification.valid && verification.manifest !== null) {
      valid.push({ directory, manifest: verification.manifest });
    } else {
      invalidSnapshots.push({
        relativePath: directory.relativePath,
        issues: verification.issues,
      });
    }
  }

  const index = buildSnapshotIndexFromManifests(
    valid.map((item) => item.manifest),
    updatedAt,
  );
  await writeSnapshotIndex(paths, store, index);

  const latest = valid.at(-1) ?? null;
  let currentRepaired = false;
  let currentPath: string | null = null;
  const current = await readCurrentPointer(paths, store).catch(() => null);
  const currentIsValid =
    current !== null &&
    valid.some(
      (item) =>
        item.manifest.analysisDate === current.analysisDate &&
        item.manifest.snapshotVersion === current.snapshotVersion,
    );
  const currentIsLatest =
    currentIsValid &&
    latest !== null &&
    (current.analysisDate > latest.manifest.analysisDate ||
      (current.analysisDate === latest.manifest.analysisDate &&
        current.snapshotVersion >= latest.manifest.snapshotVersion));

  if (latest !== null && !currentIsLatest) {
    const pointer = {
      schemaVersion: 1 as const,
      analysisDate: latest.manifest.analysisDate,
      snapshotVersion: latest.manifest.snapshotVersion,
      snapshotPath: latest.directory.relativePath,
      updatedAt,
    };
    await writeCurrentPointer(paths, store, pointer);
    currentRepaired = true;
    currentPath = pointer.snapshotPath;
  } else if (currentIsLatest && current !== null) {
    currentPath = current.snapshotPath;
  } else if (latest === null) {
    if (await store.exists(paths.currentPointerFile())) {
      await rm(await paths.resolveSafe(paths.currentPointerFile()), { force: true });
      warnings.push("No valid published snapshot is available for current.json");
    }
  }

  const lockCleanup = await locks.cleanupStaleLocks({
    now: () => now.getTime(),
    ...(options.staleLockMs === undefined ? {} : { staleMs: options.staleLockMs }),
  });
  warnings.push(...lockCleanup.warnings);

  return {
    scannedSnapshots: directories.length,
    validSnapshots: valid.length,
    invalidSnapshots,
    rebuiltIndex: true,
    currentRepaired,
    currentPath,
    cleanedTempEntries,
    cleanedStaleLocks: lockCleanup.cleaned,
    warnings,
  };
}

async function cleanupExpiredTemp(
  paths: DataPaths,
  nowMs: number,
  maxAgeMs: number,
): Promise<number> {
  const root = await paths.resolveSafe("temp");
  return cleanupDirectory(root, nowMs, maxAgeMs);
}

async function cleanupDirectory(
  directory: string,
  nowMs: number,
  maxAgeMs: number,
): Promise<number> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error)) {
      return 0;
    }
    throw error;
  }

  let removed = 0;
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      removed += await cleanupDirectory(absolute, nowMs, maxAgeMs);
      try {
        const directoryStat = await lstat(absolute);
        if (nowMs - directoryStat.mtimeMs >= maxAgeMs) {
          const remaining = await readdir(absolute);
          if (remaining.length === 0) {
            await rmdir(absolute);
          }
        }
      } catch (error) {
        if (!isMissingPath(error)) {
          throw error;
        }
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const fileStat = await lstat(absolute);
    if (nowMs - fileStat.mtimeMs >= maxAgeMs) {
      await rm(absolute, { force: true });
      removed += 1;
    }
  }
  return removed;
}

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
