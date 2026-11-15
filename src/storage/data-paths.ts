import { lstat, mkdir, realpath, readdir } from "node:fs/promises";
import { dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { DataError } from "./errors.js";

export const DATA_DIRECTORIES = [
  "config",
  "master",
  "valuation/indexes",
  "snapshots",
  "reports",
  "cache/klines",
  "system/selection",
  "system/tasks",
  "system/locks",
  "temp",
] as const;

export class DataPaths {
  readonly root: string;
  private realRoot: string | undefined;

  constructor(root = resolve(process.cwd(), "data")) {
    this.root = resolve(root);
  }

  static async create(root?: string): Promise<DataPaths> {
    const paths = new DataPaths(root);
    await paths.ensureRoot();
    return paths;
  }

  async ensureRoot(): Promise<string> {
    await mkdir(this.root, { recursive: true });
    this.realRoot ??= await realpath(this.root);
    return this.realRoot;
  }

  async ensureLayout(): Promise<void> {
    await this.ensureRoot();
    for (const directory of DATA_DIRECTORIES) {
      await mkdir(resolve(this.root, directory), { recursive: true });
    }
  }

  async resolveSafe(relativePath: string): Promise<string> {
    if (!relativePath || relativePath.includes("\0")) {
      throw pathError(relativePath, "empty or invalid path");
    }
    if (isAbsolute(relativePath)) {
      throw pathError(relativePath, "absolute paths are not allowed");
    }

    const normalized = normalize(relativePath);
    if (normalized === ".." || normalized.startsWith(`..${sep}`) || isAbsolute(normalized)) {
      throw pathError(relativePath, "path escapes the data root");
    }

    const candidate = resolve(this.root, normalized);
    if (!isInside(candidate, this.root)) {
      throw pathError(relativePath, "path escapes the data root");
    }

    const realRoot = await this.ensureRoot();
    let existingPath: string;
    try {
      const targetStat = await lstat(candidate);
      if (targetStat.isSymbolicLink()) {
        throw pathError(relativePath, "symbolic links are not allowed as targets");
      }
      existingPath = candidate;
    } catch (error) {
      if (isMissingPath(error)) {
        existingPath = await nearestExistingAncestor(dirname(candidate));
      } else {
        throw error;
      }
    }

    const ancestorStat = await lstat(existingPath);
    if (ancestorStat.isSymbolicLink()) {
      throw pathError(relativePath, "symbolic link in path");
    }

    const realExistingPath = await realpath(existingPath);
    if (!isInside(realExistingPath, realRoot)) {
      throw pathError(relativePath, "resolved path escapes the data root");
    }

    return candidate;
  }

  async list(relativeDirectory: string): Promise<string[]> {
    const directory = await this.resolveSafe(relativeDirectory);
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries.map((entry) => entry.name).sort();
    } catch (error) {
      if (isMissingPath(error)) {
        return [];
      }
      throw error;
    }
  }

  configFile(name: string): string {
    assertFilenameSegment(name);
    return `config/${name}`;
  }

  valuationIndexFile(indexCode: string): string {
    assertFilenameSegment(indexCode);
    return `valuation/indexes/${indexCode}.json`;
  }

  klineCacheFile(code: string): string {
    assertFilenameSegment(code);
    return `cache/klines/${code}.json`;
  }

  snapshotPath(analysisDate: string, version: number | string, suffix = ""): string {
    assertFilenameSegment(analysisDate);
    assertFilenameSegment(String(version));
    const base = `snapshots/${analysisDate}/${version}`;
    return suffix ? `${base}/${safeRelativeSegments(suffix)}` : base;
  }

  snapshotVersionPath(analysisDate: string, version: number, suffix = ""): string {
    assertPositiveInteger(version, "snapshot version");
    return this.snapshotPath(analysisDate, `v${version}`, suffix);
  }

  tempSnapshotPath(analysisDate: string, version: number, taskId: string, suffix = ""): string {
    assertFilenameSegment(analysisDate);
    assertPositiveInteger(version, "snapshot version");
    assertFilenameSegment(taskId);
    const base = `temp/snapshots/${analysisDate}/v${version}-${taskId}`;
    return suffix ? `${base}/${safeRelativeSegments(suffix)}` : base;
  }

  taskFile(taskId: string): string {
    assertFilenameSegment(taskId);
    return `system/tasks/${taskId}.json`;
  }

  taskTempFile(taskId: string, name: string): string {
    assertFilenameSegment(taskId);
    assertFilenameSegment(name);
    return `temp/${taskId}/${name}`;
  }

  currentPointerFile(): string {
    return "system/current.json";
  }

  snapshotIndexFile(): string {
    return "system/snapshot-index.json";
  }

  reportDirectory(analysisDate: string): string {
    assertFilenameSegment(analysisDate);
    return `reports/${analysisDate}`;
  }

  reportFile(analysisDate: string, reportId: string): string {
    assertFilenameSegment(reportId);
    return `${this.reportDirectory(analysisDate)}/${reportId}.json`;
  }

  reportIndexFile(analysisDate: string): string {
    return `${this.reportDirectory(analysisDate)}/index.json`;
  }

  lockTarget(name: string): string {
    assertFilenameSegment(name);
    return `system/locks/${name}`;
  }
}

async function nearestExistingAncestor(start: string): Promise<string> {
  let current = start;
  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if (!isMissingPath(error)) {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
}

function isInside(candidate: string, root: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function pathError(path: string, reason: string): DataError {
  return new DataError({
    code: "PATH_ESCAPE",
    message: `Unsafe data path ${JSON.stringify(path)}: ${reason}`,
    path,
    context: { reason },
  });
}

function assertFilenameSegment(value: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(value) || value === "." || value === "..") {
    throw pathError(value, "invalid filename segment");
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw pathError(String(value), `${label} must be a positive integer`);
  }
}

function safeRelativeSegments(value: string): string {
  const normalized = normalize(value);
  if (normalized.startsWith(`..${sep}`) || normalized === ".." || isAbsolute(normalized)) {
    throw pathError(value, "invalid relative suffix");
  }
  return normalized;
}
