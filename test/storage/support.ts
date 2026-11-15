import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DataPaths } from "../../src/storage/data-paths.js";

export interface TempDataRoot {
  root: string;
  paths: DataPaths;
  cleanup(): Promise<void>;
}

export async function createTempDataRoot(): Promise<TempDataRoot> {
  const root = await mkdtemp(join(tmpdir(), "maga-storage-test-"));
  const paths = await DataPaths.create(root);
  await paths.ensureLayout();

  return {
    root,
    paths,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}
