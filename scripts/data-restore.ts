import { resolve } from "node:path";
import { BackupService } from "../src/backups/backup-service.js";
import { DataPaths } from "../src/storage/data-paths.js";
import { JsonStore } from "../src/storage/json-store.js";

const args = process.argv.slice(2);
const from = readOption("--from");
if (from === null) {
  throw new Error("--from is required");
}
const dryRun = args.includes("--dry-run");

const paths = await DataPaths.create();
await paths.ensureLayout();
const service = new BackupService(paths, new JsonStore(paths));
if (dryRun) {
  const validation = await service.validate(resolve(from));
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        backupPath: validation.backupPath,
        createdAt: validation.manifest.createdAt,
        files: validation.verifiedFiles,
        bytes: validation.verifiedBytes,
        includeTasks: validation.manifest.includeTasks,
      },
      null,
      2,
    ),
  );
} else {
  const result = await service.restore({ from: resolve(from) });
  console.log(
    JSON.stringify(
      {
        backupPath: result.validation.backupPath,
        verifiedFiles: result.validation.verifiedFiles,
        verifiedBytes: result.validation.verifiedBytes,
        configBackupPath: result.configBackupPath,
        current: result.current,
        recovery: result.recovery,
        currentVerified: result.currentVerification?.valid ?? null,
      },
      null,
      2,
    ),
  );
  if (result.currentVerification !== null && !result.currentVerification.valid) {
    process.exitCode = 1;
  }
}

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
