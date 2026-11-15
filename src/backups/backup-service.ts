import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import type { CurrentPointer } from "../domain/snapshot.js";
import { recoverSystem, type RecoveryReport } from "../snapshots/recovery.js";
import { verifySnapshot, type SnapshotVerificationResult } from "../snapshots/snapshot-verifier.js";
import { readCurrentPointer } from "../snapshots/snapshot-system.js";
import { sha256File } from "../storage/checksum.js";
import type { DataPaths } from "../storage/data-paths.js";
import type { JsonStore } from "../storage/json-store.js";
import { LockManager } from "../storage/lock-manager.js";
import { BackupError } from "./errors.js";
import {
  BACKUP_DIRECTORIES,
  BACKUP_STATE_FILES,
  backupManifestSchema,
  type BackupEntry,
  type BackupManifest,
  type BackupResult,
  type BackupValidationResult,
} from "./types.js";

export interface CreateBackupOptions {
  to: string;
  includeTasks?: boolean;
}

export interface RestoreBackupOptions {
  from: string;
}

export interface RestoreBackupResult {
  validation: BackupValidationResult;
  configBackupPath: string | null;
  recovery: RecoveryReport;
  current: CurrentPointer | null;
  currentVerification: SnapshotVerificationResult | null;
}

export interface BackupServiceDependencies {
  now?: () => Date;
}

interface ReplaceOperation {
  kind: "directory" | "file";
  target: string;
  rollback: string;
  hadTarget: boolean;
}

export class BackupService {
  private readonly now: () => Date;

  constructor(
    private readonly paths: DataPaths,
    private readonly store: JsonStore,
    dependencies: BackupServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async create(options: CreateBackupOptions): Promise<BackupResult> {
    const destinationRoot = resolve(options.to);
    const realDataRoot = await this.paths.ensureRoot();
    await mkdir(destinationRoot, { recursive: true });
    const realDestinationRoot = await realpath(destinationRoot);
    if (isInside(realDataRoot, realDestinationRoot)) {
      throw new BackupError({
        code: "BACKUP_PATH_INVALID",
        message: "Backup destination must be outside the data root",
        path: realDestinationRoot,
      });
    }

    const stamp = backupStamp(this.now());
    const finalPath = await uniqueDirectoryPath(destinationRoot, stamp);
    const stagingPath = await mkdtemp(join(destinationRoot, ".maga-backup-"));
    const directories = [
      ...BACKUP_DIRECTORIES,
      ...(options.includeTasks === true ? ["system/tasks"] : []),
    ];
    const entries: BackupEntry[] = [];

    try {
      for (const directory of directories) {
        const target = resolveInside(stagingPath, directory);
        await mkdir(target, { recursive: true });
        const source = resolveInside(this.paths.root, directory);
        if (!(await pathExists(source))) {
          continue;
        }
        const sourceStat = await lstat(source);
        if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) {
          throw invalidBackup(`Backup source is not a regular directory: ${directory}`, source);
        }
        await copyTree(source, target, directory, entries);
      }

      for (const file of BACKUP_STATE_FILES) {
        const source = resolveInside(this.paths.root, file);
        if (!(await pathExists(source))) {
          continue;
        }
        const sourceStat = await lstat(source);
        if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
          throw invalidBackup(`Backup source is not a regular file: ${file}`, source);
        }
        const target = resolveInside(stagingPath, file);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(source, target);
        entries.push(await entryFor(target, file));
      }

      const sorted = entries.sort((left, right) => left.path.localeCompare(right.path));
      const manifest = backupManifestSchema.parse({
        schemaVersion: 1,
        createdAt: this.now().toISOString(),
        includeTasks: options.includeTasks === true,
        directories,
        entries: sorted,
        totals: {
          files: sorted.length,
          bytes: sorted.reduce((total, entry) => total + entry.bytes, 0),
        },
      });
      await writeFile(
        join(stagingPath, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        {
          encoding: "utf8",
          mode: 0o600,
        },
      );
      await rename(stagingPath, finalPath);
      return { backupPath: finalPath, manifest };
    } catch (error) {
      await rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
      if (error instanceof BackupError) {
        throw error;
      }
      throw new BackupError({
        code: "BACKUP_INVALID",
        message: error instanceof Error ? error.message : String(error),
        path: finalPath,
        cause: error,
      });
    }
  }

  async validate(from: string): Promise<BackupValidationResult> {
    const backupPath = resolve(from);
    if (!(await pathExists(backupPath))) {
      throw new BackupError({
        code: "BACKUP_NOT_FOUND",
        message: "Backup directory was not found",
        path: backupPath,
      });
    }
    const backupStat = await lstat(backupPath);
    if (backupStat.isSymbolicLink() || !backupStat.isDirectory()) {
      throw invalidBackup("Backup path must be a regular directory", backupPath);
    }

    const manifestPath = join(backupPath, "manifest.json");
    if (!(await pathExists(manifestPath))) {
      throw invalidBackup("Backup manifest is missing", manifestPath);
    }
    let manifestValue: unknown;
    try {
      manifestValue = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    } catch (error) {
      throw new BackupError({
        code: "BACKUP_INVALID",
        message: "Backup manifest is not valid JSON",
        path: manifestPath,
        cause: error,
      });
    }
    const parsed = backupManifestSchema.safeParse(manifestValue);
    if (!parsed.success) {
      throw new BackupError({
        code: "BACKUP_INVALID",
        message: `Backup manifest failed validation: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
        path: manifestPath,
      });
    }
    const manifest = parsed.data;
    validateManifestPaths(manifest);

    const diskFiles = await collectFiles(backupPath);
    const expected = new Set(manifest.entries.map((entry) => entry.path));
    const actual = new Set(diskFiles.filter((path) => path !== "manifest.json"));
    if (
      expected.size !== actual.size ||
      [...expected].some((path) => !actual.has(path)) ||
      [...actual].some((path) => !expected.has(path))
    ) {
      throw invalidBackup("Backup file list does not match manifest", backupPath);
    }

    let verifiedFiles = 0;
    let verifiedBytes = 0;
    for (const entry of manifest.entries) {
      const filePath = resolveInside(backupPath, entry.path);
      const fileStat = await lstat(filePath);
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
        throw invalidBackup(`Backup entry is not a regular file: ${entry.path}`, filePath);
      }
      if (fileStat.size !== entry.bytes) {
        throw new BackupError({
          code: "BACKUP_INVALID",
          message: `Backup file size mismatch: ${entry.path}`,
          path: filePath,
        });
      }
      const checksum = `sha256:${await sha256File(filePath)}`;
      if (checksum !== entry.checksum) {
        throw new BackupError({
          code: "BACKUP_CHECKSUM_MISMATCH",
          message: `Backup checksum mismatch: ${entry.path}`,
          path: filePath,
        });
      }
      verifiedFiles += 1;
      verifiedBytes += entry.bytes;
    }

    return { backupPath, manifest, verifiedFiles, verifiedBytes };
  }

  async restore(options: RestoreBackupOptions): Promise<RestoreBackupResult> {
    const validation = await this.validate(options.from);
    const now = this.now();
    const stamp = backupStamp(now);
    const tempRoot = await this.paths.resolveSafe("temp");
    await mkdir(tempRoot, { recursive: true });
    const stagingPath = await mkdtemp(join(tempRoot, `restore-${stamp}-`));
    const payload = join(stagingPath, "payload");
    const rollbackRoot = join(stagingPath, "rollback");
    const operations: ReplaceOperation[] = [];
    let configBackupPath: string | null = null;

    try {
      await mkdir(payload, { recursive: true });
      for (const entry of validation.manifest.entries) {
        const source = resolveInside(validation.backupPath, entry.path);
        const target = resolveInside(payload, entry.path);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(source, target);
      }
      for (const directory of validation.manifest.directories) {
        await mkdir(resolveInside(payload, directory), { recursive: true });
      }

      configBackupPath = await this.backupCurrentConfig(stamp);
      for (const directory of validation.manifest.directories) {
        const target = await this.paths.resolveSafe(directory);
        const rollback = join(rollbackRoot, directory);
        const operation = await replacePath(
          target,
          resolveInside(payload, directory),
          rollback,
          "directory",
        );
        operations.push(operation);
      }
      for (const file of BACKUP_STATE_FILES) {
        const target = await this.paths.resolveSafe(file);
        const rollback = join(rollbackRoot, file);
        const staged = resolveInside(payload, file);
        const operation = await replacePath(
          target,
          (await pathExists(staged)) ? staged : null,
          rollback,
          "file",
        );
        operations.push(operation);
      }

      const recovery = await recoverSystem(this.paths, this.store, new LockManager(this.paths), {
        now,
      });
      const current = await readCurrentPointer(this.paths, this.store);
      let currentVerification: SnapshotVerificationResult | null = null;
      if (recovery.currentPath !== null) {
        currentVerification = await verifySnapshot(this.paths, this.store, recovery.currentPath, {
          allowedStatuses: ["published"],
        });
        if (!currentVerification.valid) {
          throw new BackupError({
            code: "RESTORE_FAILED",
            message: "Restored current snapshot failed checksum verification",
            path: recovery.currentPath,
            cause: currentVerification.issues,
          });
        }
      }

      await rm(stagingPath, { recursive: true, force: true });
      return {
        validation,
        configBackupPath,
        recovery,
        current,
        currentVerification,
      };
    } catch (error) {
      try {
        await rollbackOperations(operations);
      } catch (rollbackError) {
        throw new BackupError({
          code: "RESTORE_ROLLBACK_FAILED",
          message: `Restore failed and rollback also failed: ${errorMessage(rollbackError)}`,
          path: stagingPath,
          cause: rollbackError,
        });
      }
      await rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
      throw error instanceof BackupError
        ? error
        : new BackupError({
            code: "RESTORE_FAILED",
            message: errorMessage(error),
            path: validation.backupPath,
            cause: error,
          });
    }
  }

  private async backupCurrentConfig(stamp: string): Promise<string | null> {
    const configPath = await this.paths.resolveSafe("config");
    if (!(await pathExists(configPath))) {
      return null;
    }
    const backupPath = await this.paths.resolveSafe(`system/restore-backups/${stamp}/config`);
    await mkdir(dirname(backupPath), { recursive: true });
    await copyTree(configPath, backupPath, "", []);
    return backupPath;
  }
}

async function replacePath(
  target: string,
  staged: string | null,
  rollback: string,
  kind: "directory" | "file",
): Promise<ReplaceOperation> {
  const hadTarget = await pathExists(target);
  if (hadTarget) {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink()) {
      throw invalidBackup(`Refusing to replace symbolic link: ${target}`, target);
    }
    await mkdir(dirname(rollback), { recursive: true });
    await rename(target, rollback);
  }
  try {
    if (staged === null) {
      return { kind, target, rollback, hadTarget };
    }
    await mkdir(dirname(target), { recursive: true });
    await rename(staged, target);
    return { kind, target, rollback, hadTarget };
  } catch (error) {
    if (hadTarget && (await pathExists(rollback))) {
      await rename(rollback, target).catch(() => undefined);
    }
    throw error;
  }
}

async function rollbackOperations(operations: readonly ReplaceOperation[]): Promise<void> {
  for (const operation of [...operations].reverse()) {
    await rm(operation.target, { recursive: true, force: true });
    if (operation.hadTarget && (await pathExists(operation.rollback))) {
      await mkdir(dirname(operation.target), { recursive: true });
      await rename(operation.rollback, operation.target);
    }
  }
}

async function copyTree(
  source: string,
  destination: string,
  relativePrefix: string,
  entries: BackupEntry[],
): Promise<void> {
  await mkdir(destination, { recursive: true });
  const children = await readdir(source, { withFileTypes: true });
  children.sort((left, right) => left.name.localeCompare(right.name));
  for (const child of children) {
    const sourceChild = join(source, child.name);
    const destinationChild = join(destination, child.name);
    const relativeChild = relativePrefix === "" ? child.name : `${relativePrefix}/${child.name}`;
    const childStat = await lstat(sourceChild);
    if (childStat.isSymbolicLink()) {
      throw invalidBackup(
        `Symbolic links are not allowed in backups: ${relativeChild}`,
        sourceChild,
      );
    }
    if (childStat.isDirectory()) {
      await copyTree(sourceChild, destinationChild, relativeChild, entries);
      continue;
    }
    if (!childStat.isFile()) {
      throw invalidBackup(`Unsupported file type in backup: ${relativeChild}`, sourceChild);
    }
    await mkdir(dirname(destinationChild), { recursive: true });
    await copyFile(sourceChild, destinationChild);
    entries.push(await entryFor(destinationChild, relativeChild));
  }
}

async function entryFor(absolutePath: string, relativePath: string): Promise<BackupEntry> {
  const fileStat = await stat(absolutePath);
  return {
    path: relativePath,
    bytes: fileStat.size,
    checksum: `sha256:${await sha256File(absolutePath)}`,
  };
}

async function collectFiles(root: string, prefix = ""): Promise<string[]> {
  const directory = prefix === "" ? root : resolveInside(root, prefix);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const absolute = join(directory, entry.name);
    const childStat = await lstat(absolute);
    if (childStat.isSymbolicLink()) {
      throw invalidBackup(`Symbolic links are not allowed in backups: ${child}`, absolute);
    }
    if (childStat.isDirectory()) {
      files.push(...(await collectFiles(root, child)));
    } else if (childStat.isFile()) {
      files.push(child);
    } else {
      throw invalidBackup(`Unsupported file type in backup: ${child}`, absolute);
    }
  }
  return files.sort();
}

function validateManifestPaths(manifest: BackupManifest): void {
  const directories = new Set(manifest.directories);
  const allowedDirectories = new Set<string>([
    ...BACKUP_DIRECTORIES,
    ...(manifest.includeTasks ? ["system/tasks"] : []),
  ]);
  if (directories.size !== manifest.directories.length) {
    throw invalidBackup("Backup manifest has duplicate directories", "manifest.json");
  }
  for (const directory of manifest.directories) {
    if (!allowedDirectories.has(directory)) {
      throw invalidBackup(
        `Backup manifest contains an unsupported directory: ${directory}`,
        "manifest.json",
      );
    }
  }
  const paths = new Set<string>();
  for (const entry of manifest.entries) {
    if (paths.has(entry.path)) {
      throw invalidBackup(
        `Backup manifest contains a duplicate file: ${entry.path}`,
        "manifest.json",
      );
    }
    paths.add(entry.path);
    const allowed =
      (BACKUP_STATE_FILES as readonly string[]).includes(entry.path) ||
      manifest.directories.some((directory) => entry.path.startsWith(`${directory}/`));
    if (!allowed) {
      throw invalidBackup(
        `Backup manifest contains an unsupported path: ${entry.path}`,
        "manifest.json",
      );
    }
  }
}

function resolveInside(root: string, relativePath: string): string {
  if (!relativePath || isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw invalidBackup(`Invalid relative path: ${relativePath}`, root);
  }
  const normalized = normalize(relativePath);
  if (normalized === ".." || normalized.startsWith(`..${sep}`) || isAbsolute(normalized)) {
    throw invalidBackup(`Path escapes its root: ${relativePath}`, root);
  }
  const candidate = resolve(root, normalized);
  if (!isInside(root, candidate)) {
    throw invalidBackup(`Path escapes its root: ${relativePath}`, root);
  }
  return candidate;
}

function isInside(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  return value === "" || (!value.startsWith(`..${sep}`) && value !== ".." && !isAbsolute(value));
}

async function uniqueDirectoryPath(parent: string, stamp: string): Promise<string> {
  const base = join(parent, stamp);
  if (!(await pathExists(base))) {
    return base;
  }
  for (let suffix = 1; suffix <= 10_000; suffix += 1) {
    const candidate = join(parent, `${stamp}-${String(suffix).padStart(2, "0")}`);
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }
  throw new BackupError({
    code: "BACKUP_ALREADY_EXISTS",
    message: "Could not allocate a unique backup directory",
    path: parent,
  });
}

function backupStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissingPath(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function invalidBackup(message: string, path: string): BackupError {
  return new BackupError({ code: "BACKUP_INVALID", message, path });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
