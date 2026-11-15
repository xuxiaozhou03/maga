import { currentPointerSchema } from "../src/domain/snapshot.js";
import { ConfigLoader } from "../src/config/loader.js";
import { listSnapshotDirectories } from "../src/snapshots/repository.js";
import { verifySnapshot } from "../src/snapshots/snapshot-verifier.js";
import { DataPaths } from "../src/storage/data-paths.js";
import { JsonStore } from "../src/storage/json-store.js";

const paths = await DataPaths.create();
await paths.ensureLayout();
const store = new JsonStore(paths);
const issues: string[] = [];
let configOk = true;
try {
  const config = await (await ConfigLoader.create(paths.root)).loadAll();
  void config;
} catch (error) {
  configOk = false;
  issues.push(`CONFIG_INVALID: ${error instanceof Error ? error.message : String(error)}`);
}

const directories = await listSnapshotDirectories(paths);
const snapshots = [];
for (const directory of directories) {
  const verification = await verifySnapshot(paths, store, directory.relativePath, {
    allowedStatuses: ["published"],
  });
  snapshots.push({
    path: directory.relativePath,
    valid: verification.valid,
    issues: verification.issues,
  });
  if (!verification.valid) {
    issues.push(`SNAPSHOT_INVALID: ${directory.relativePath}`);
  }
}

let current = null;
try {
  current = await store.read(paths.currentPointerFile(), currentPointerSchema);
} catch (error) {
  issues.push(`CURRENT_INVALID: ${error instanceof Error ? error.message : String(error)}`);
}
if (
  current !== null &&
  !snapshots.some((snapshot) => snapshot.path === current?.snapshotPath && snapshot.valid)
) {
  issues.push(`CURRENT_UNRESOLVED: ${current.snapshotPath}`);
}

const result = {
  dataRoot: paths.root,
  configOk,
  snapshotCount: snapshots.length,
  validSnapshots: snapshots.filter((snapshot) => snapshot.valid).length,
  current,
  snapshots,
  issues,
};
console.log(JSON.stringify(result, null, 2));
if (issues.length > 0) {
  process.exitCode = 1;
}
