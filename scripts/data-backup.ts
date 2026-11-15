import { resolve } from "node:path";
import { BackupService } from "../src/backups/backup-service.js";
import { DataPaths } from "../src/storage/data-paths.js";
import { JsonStore } from "../src/storage/json-store.js";

const args = process.argv.slice(2);
const to = readOption("--to");
if (to === null) {
  throw new Error("--to is required");
}
const includeTasks = args.includes("--include-tasks");

const paths = await DataPaths.create();
await paths.ensureLayout();
const service = new BackupService(paths, new JsonStore(paths));
const result = await service.create({ to: resolve(to), includeTasks });
console.log(
  JSON.stringify(
    {
      backupPath: result.backupPath,
      files: result.manifest.totals.files,
      bytes: result.manifest.totals.bytes,
      includeTasks: result.manifest.includeTasks,
      createdAt: result.manifest.createdAt,
    },
    null,
    2,
  ),
);

function readOption(name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) {
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
