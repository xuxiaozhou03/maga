import { lstat, mkdir, open, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { snapshotManifestSchema, type SnapshotManifest } from "../domain/snapshot.js";
import type { DataPaths } from "../storage/data-paths.js";
import type { JsonStore } from "../storage/json-store.js";
import { SnapshotError } from "./errors.js";
import type { BuiltSnapshot } from "./snapshot-builder.js";
import { verifySnapshot } from "./snapshot-verifier.js";

export interface PublishedSnapshot {
  relativePath: string;
  manifest: SnapshotManifest;
}

export async function promoteBuiltSnapshot(
  paths: DataPaths,
  store: JsonStore,
  built: BuiltSnapshot,
  options: { publishedAt: string },
): Promise<PublishedSnapshot> {
  const targetPath = paths.snapshotVersionPath(
    built.manifest.analysisDate,
    built.manifest.snapshotVersion,
  );
  await assertTargetDoesNotExist(paths, targetPath);

  const publishedManifest = snapshotManifestSchema.parse({
    ...built.manifest,
    status: "published",
    publishedAt: options.publishedAt,
  });
  await store.writeAtomic(
    `${built.relativePath}/manifest.json`,
    publishedManifest,
    snapshotManifestSchema,
  );

  const temporaryVerification = await verifySnapshot(paths, store, built.relativePath, {
    allowedStatuses: ["published"],
  });
  if (!temporaryVerification.valid) {
    throw new SnapshotError({
      code: "SNAPSHOT_INVALID",
      message: "Pre-publication snapshot verification failed",
      context: { issues: temporaryVerification.issues },
    });
  }

  const temporaryPath = await paths.resolveSafe(built.relativePath);
  const targetAbsolutePath = await paths.resolveSafe(targetPath);
  await mkdir(dirname(targetAbsolutePath), { recursive: true });
  try {
    await rename(temporaryPath, targetAbsolutePath);
  } catch (error) {
    throw new SnapshotError({
      code: "SNAPSHOT_ALREADY_EXISTS",
      message: `Failed to promote snapshot to ${targetPath}`,
      context: { targetPath },
      cause: error,
    });
  }

  await fsyncDirectory(dirname(targetAbsolutePath));
  await fsyncDirectory(targetAbsolutePath);
  return { relativePath: targetPath, manifest: publishedManifest };
}

async function assertTargetDoesNotExist(paths: DataPaths, relativePath: string): Promise<void> {
  const target = await paths.resolveSafe(relativePath);
  try {
    await lstat(target);
    throw new SnapshotError({
      code: "SNAPSHOT_ALREADY_EXISTS",
      message: `Refusing to overwrite published snapshot: ${relativePath}`,
      context: { relativePath },
    });
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw error;
    }
    if (!isMissingPath(error)) {
      throw error;
    }
  }
}

async function fsyncDirectory(directory: string): Promise<void> {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (!isIgnorableFsyncError(error)) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isIgnorableFsyncError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  return ["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EBADF"].includes(
    String((error as NodeJS.ErrnoException).code),
  );
}
