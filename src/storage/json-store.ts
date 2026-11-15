import { randomUUID } from "node:crypto";
import { access, link, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { z } from "zod";
import { canonicalJson, parseJsonText } from "./canonical-json.js";
import { DataPaths } from "./data-paths.js";
import { DataError } from "./errors.js";
import { formatConfigIssues } from "./zod-utils.js";

export interface JsonWriteOptions {
  overwrite?: boolean;
}

export interface JsonStoreHooks {
  beforeRename?: (targetPath: string, tempPath: string) => void | Promise<void>;
}

export interface JsonStoreDependencies {
  hooks?: JsonStoreHooks;
}

export class JsonStore {
  private readonly hooks: JsonStoreHooks;

  constructor(
    private readonly paths: DataPaths,
    dependencies: JsonStoreDependencies = {},
  ) {
    this.hooks = dependencies.hooks ?? {};
  }

  async read<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
    const resolvedPath = await this.paths.resolveSafe(path);
    let text: string;
    try {
      text = await readFile(resolvedPath, "utf8");
    } catch (error) {
      if (isMissingPath(error)) {
        return null;
      }
      throw new DataError({
        code: "DATA_CORRUPT",
        message: `Failed to read data file: ${path}`,
        path,
        cause: error,
      });
    }

    let value: unknown;
    try {
      value = parseJsonText(text);
    } catch (error) {
      throw new DataError({
        code: "DATA_CORRUPT",
        message: `Invalid JSON file: ${path}`,
        path,
        cause: error,
      });
    }

    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new DataError({
        code: "DATA_CORRUPT",
        message: `Data file failed schema validation: ${path}`,
        path,
        context: { issues: formatConfigIssues(parsed.error) },
      });
    }

    return parsed.data;
  }

  async writeAtomic<T>(
    path: string,
    data: T,
    schema: z.ZodType<T>,
    options: JsonWriteOptions = {},
  ): Promise<void> {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new DataError({
        code: "SCHEMA_INVALID",
        message: `Refusing to write invalid data: ${path}`,
        path,
        context: { issues: formatConfigIssues(parsed.error) },
      });
    }

    const serialized = canonicalJson(parsed.data);
    const targetPath = await this.paths.resolveSafe(path);
    const parentPath = dirname(targetPath);
    await mkdir(parentPath, { recursive: true });

    const tempPath = join(
      parentPath,
      `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let tempExists = false;

    try {
      const handle = await open(tempPath, "wx", 0o600);
      tempExists = true;
      try {
        await handle.writeFile(serialized, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }

      await this.hooks.beforeRename?.(targetPath, tempPath);
      if (options.overwrite === false) {
        try {
          await link(tempPath, targetPath);
        } catch (error) {
          if (isAlreadyExists(error)) {
            throw new DataError({
              code: "WRITE_FAILED",
              message: `Refusing to overwrite existing file: ${path}`,
              path,
              cause: error,
            });
          }
          throw error;
        }
        await unlink(tempPath);
        tempExists = false;
      } else {
        await rename(tempPath, targetPath);
        tempExists = false;
      }

      await fsyncDirectory(parentPath);
    } catch (error) {
      if (error instanceof DataError) {
        throw error;
      }
      throw new DataError({
        code: "WRITE_FAILED",
        message: `Atomic write failed: ${path}`,
        path,
        cause: error,
      });
    } finally {
      if (tempExists) {
        await unlink(tempPath).catch(() => undefined);
      }
    }
  }

  async updateAtomic<T>(
    path: string,
    schema: z.ZodType<T>,
    updater: (current: T | null) => T,
  ): Promise<T> {
    const current = await this.read(path, schema);
    const next = updater(current);
    await this.writeAtomic(path, next, schema);
    return next;
  }

  async exists(path: string): Promise<boolean> {
    const resolvedPath = await this.paths.resolveSafe(path);
    try {
      await access(resolvedPath);
      return true;
    } catch (error) {
      if (isMissingPath(error)) {
        return false;
      }
      throw error;
    }
  }

  async list(directory: string): Promise<string[]> {
    return this.paths.list(directory);
  }
}

async function fsyncDirectory(directory: string): Promise<void> {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (!isIgnorableDirectorySyncError(error)) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function isIgnorableDirectorySyncError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  return ["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EBADF", "ENOSYS"].includes(
    String((error as NodeJS.ErrnoException).code),
  );
}

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}
