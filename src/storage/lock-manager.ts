import { hostname } from "node:os";
import { lstat, mkdir, open, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as lockfile from "proper-lockfile";
import { canonicalJson, parseJsonText } from "./canonical-json.js";
import type { DataPaths } from "./data-paths.js";
import { DataError } from "./errors.js";

export interface LockMetadata {
  taskId: string;
  reason?: string;
}

export interface LockAcquireOptions {
  maxWaitMs?: number;
  retryDelayMs?: number;
  staleMs?: number;
}

export interface LockHandle {
  name: string;
  targetPath: string;
  metadata: {
    taskId: string;
    pid: number;
    host: string;
    acquiredAt: string;
    reason: string | null;
  };
  release(): Promise<void>;
}

export interface LockManagerDependencies {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pid?: number;
  host?: string;
}

export interface StaleLockCleanupOptions {
  staleMs?: number;
  now?: () => number;
}

export interface StaleLockCleanupResult {
  cleaned: string[];
  warnings: string[];
}

const DEFAULT_MAX_WAIT_MS = 60_000;
const DEFAULT_RETRY_DELAY_MS = 100;
const DEFAULT_STALE_MS = 10 * 60_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LockManager {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly pid: number;
  private readonly host: string;

  constructor(
    private readonly paths: DataPaths,
    dependencies: LockManagerDependencies = {},
  ) {
    this.sleep = dependencies.sleep ?? defaultSleep;
    this.now = dependencies.now ?? Date.now;
    this.pid = dependencies.pid ?? process.pid;
    this.host = dependencies.host ?? hostname();
  }

  async acquire(
    name: string,
    metadata: LockMetadata,
    options: LockAcquireOptions = {},
  ): Promise<LockHandle> {
    assertLockName(name);
    if (!metadata.taskId.trim()) {
      throw new DataError({
        code: "TASK_CONFLICT",
        message: "Lock metadata requires a non-empty taskId",
        context: { lock: name },
      });
    }

    const targetPath = await this.paths.resolveSafe(this.paths.lockTarget(name));
    await mkdir(dirname(targetPath), { recursive: true });
    const marker = await open(targetPath, "a", 0o600);
    await marker.close();

    const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
    const deadline = this.now() + maxWaitMs;
    let releaseLock: (() => Promise<void>) | undefined;

    while (!releaseLock) {
      try {
        releaseLock = await lockfile.lock(targetPath, {
          realpath: false,
          stale: staleMs,
          update: Math.min(5_000, Math.max(1_000, Math.floor(staleMs / 2))),
          retries: 0,
        });
      } catch (error) {
        if (!isLockedError(error)) {
          throw new DataError({
            code: "WRITE_FAILED",
            message: `Failed to acquire lock: ${name}`,
            context: { lock: name },
            cause: error,
          });
        }

        const remainingMs = deadline - this.now();
        if (remainingMs <= 0) {
          throw new DataError({
            code: "TASK_CONFLICT",
            message: `Task conflict while acquiring lock: ${name}`,
            context: { lock: name, maxWaitMs },
            cause: error,
          });
        }
        await this.sleep(Math.min(retryDelayMs, remainingMs));
      }
    }

    const acquiredMetadata = {
      taskId: metadata.taskId,
      pid: this.pid,
      host: this.host,
      acquiredAt: new Date(this.now()).toISOString(),
      reason: metadata.reason ?? null,
    };

    try {
      await writeFile(targetPath, canonicalJson(acquiredMetadata), {
        encoding: "utf8",
        mode: 0o600,
      });
    } catch (error) {
      await releaseLock().catch(() => undefined);
      throw new DataError({
        code: "WRITE_FAILED",
        message: `Failed to write lock metadata: ${name}`,
        context: { lock: name },
        cause: error,
      });
    }

    let released = false;
    return {
      name,
      targetPath,
      metadata: acquiredMetadata,
      release: async () => {
        if (released) {
          return;
        }
        try {
          await releaseLock();
          released = true;
        } catch (error) {
          throw new DataError({
            code: "LOCK_RELEASE_FAILED",
            message: `Failed to release lock: ${name}`,
            context: { lock: name },
            cause: error,
          });
        }
      },
    };
  }

  async withLock<T>(
    name: string,
    metadata: LockMetadata,
    operation: (handle: LockHandle) => Promise<T>,
    options: LockAcquireOptions = {},
  ): Promise<T> {
    const handle = await this.acquire(name, metadata, options);
    try {
      return await operation(handle);
    } finally {
      await handle.release();
    }
  }

  async isLocked(name: string, staleMs = DEFAULT_STALE_MS): Promise<boolean> {
    assertLockName(name);
    const targetPath = await this.paths.resolveSafe(this.paths.lockTarget(name));
    try {
      return await lockfile.check(targetPath, { realpath: false, stale: staleMs });
    } catch (error) {
      if (isMissingPath(error)) {
        return false;
      }
      throw error;
    }
  }

  async cleanupStaleLocks(options: StaleLockCleanupOptions = {}): Promise<StaleLockCleanupResult> {
    const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
    const now = options.now ?? this.now;
    const lockRoot = await this.paths.resolveSafe("system/locks");
    let entries;
    try {
      entries = await readdir(lockRoot, { withFileTypes: true });
    } catch (error) {
      if (isMissingPath(error)) {
        return { cleaned: [], warnings: [] };
      }
      throw error;
    }

    const cleaned: string[] = [];
    const warnings: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".lock")) {
        continue;
      }
      const name = entry.name.slice(0, -".lock".length);
      if (!/^[A-Za-z0-9._-]+$/.test(name)) {
        continue;
      }
      const targetPath = await this.paths.resolveSafe(this.paths.lockTarget(name));
      const lockDirectory = `${targetPath}.lock`;
      const metadata = await readLockMetadata(targetPath);
      let lockStat;
      try {
        lockStat = await lstat(lockDirectory);
      } catch (error) {
        if (isMissingPath(error)) {
          continue;
        }
        throw error;
      }
      const isStale = now() - lockStat.mtimeMs >= staleMs;
      const sameHost = metadata !== null && metadata.host === this.host;
      const ownerDead = sameHost && !isProcessAlive(metadata.pid);

      if (!ownerDead && !(isStale && metadata === null)) {
        continue;
      }

      try {
        await lockfile.unlock(targetPath, { realpath: false });
        cleaned.push(name);
      } catch (error) {
        warnings.push(
          `Failed to clean stale lock ${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { cleaned, warnings };
  }
}

export function lockOwnerPath(targetPath: string): string {
  return targetPath;
}

function assertLockName(name: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") {
    throw new DataError({
      code: "PATH_ESCAPE",
      message: `Invalid lock name: ${JSON.stringify(name)}`,
    });
  }
}

function isLockedError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ELOCKED"
  );
}

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

interface LockFileMetadata {
  pid: number;
  host: string;
}

async function readLockMetadata(targetPath: string): Promise<LockFileMetadata | null> {
  try {
    const value = parseJsonText(await readFile(targetPath, "utf8"));
    if (!value || typeof value !== "object") {
      return null;
    }
    const metadata = value as { pid?: unknown; host?: unknown };
    if (
      typeof metadata.pid !== "number" ||
      !Number.isInteger(metadata.pid) ||
      metadata.pid <= 0 ||
      typeof metadata.host !== "string"
    ) {
      return null;
    }
    return { pid: metadata.pid, host: metadata.host };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (
      error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EPERM"
    );
  }
}
