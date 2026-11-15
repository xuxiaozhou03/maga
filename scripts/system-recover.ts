import { LockManager } from "../src/storage/lock-manager.js";
import { DataPaths } from "../src/storage/data-paths.js";
import { JsonStore } from "../src/storage/json-store.js";
import { recoverSystem } from "../src/snapshots/recovery.js";

const paths = await DataPaths.create();
await paths.ensureLayout();
const store = new JsonStore(paths);
const report = await recoverSystem(paths, store, new LockManager(paths));

console.log(JSON.stringify(report, null, 2));
if (report.invalidSnapshots.length > 0 || report.warnings.length > 0) {
  process.exitCode = 1;
}
