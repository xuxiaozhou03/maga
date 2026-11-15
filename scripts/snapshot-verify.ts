import { DataPaths } from "../src/storage/data-paths.js";
import { JsonStore } from "../src/storage/json-store.js";
import { recoverSystem } from "../src/snapshots/recovery.js";
import { listSnapshotDirectories } from "../src/snapshots/repository.js";
import { verifySnapshot } from "../src/snapshots/snapshot-verifier.js";
import { LockManager } from "../src/storage/lock-manager.js";

const args = process.argv.slice(2);
const all = args.includes("--all");
const repairIndex = args.includes("--repair-index");
const date = readOption("--date");
const version = readVersionOption("--version");

const paths = await DataPaths.create();
await paths.ensureLayout();
const store = new JsonStore(paths);

if (repairIndex) {
  const report = await recoverSystem(paths, store, new LockManager(paths));
  console.log(JSON.stringify(report, null, 2));
  if (report.invalidSnapshots.length > 0) {
    process.exitCode = 1;
  }
} else {
  const directories = (await listSnapshotDirectories(paths)).filter((directory) => {
    if (!all && date === null) {
      return false;
    }
    if (date !== null && directory.analysisDate !== date) {
      return false;
    }
    return version === null || directory.version === version;
  });

  if (directories.length === 0) {
    console.error("No matching snapshots found. Use --all, --date, or --version.");
    process.exitCode = 1;
  } else {
    const results = [];
    for (const directory of directories) {
      const result = await verifySnapshot(paths, store, directory.relativePath);
      results.push({
        path: result.relativePath,
        valid: result.valid,
        status: result.manifest?.status ?? null,
        issues: result.issues,
      });
    }
    console.log(JSON.stringify({ verified: results.length, results }, null, 2));
    if (results.some((result) => !result.valid)) {
      process.exitCode = 1;
    }
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

function readVersionOption(name: string): number | null {
  const value = readOption(name);
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}
