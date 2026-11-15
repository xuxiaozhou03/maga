import { snapshotIndexSchema } from "../../src/domain/snapshot.js";
import type { DataPaths } from "../../src/storage/data-paths.js";
import type { JsonStore } from "../../src/storage/json-store.js";

export async function readSnapshotIndexFileForTest(paths: DataPaths, store: JsonStore) {
  return store.read(paths.snapshotIndexFile(), snapshotIndexSchema);
}
