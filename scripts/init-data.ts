import { resolve } from "node:path";
import { DataPaths } from "../src/storage/data-paths.js";

const root = process.argv[2] ? resolve(process.argv[2]) : resolve(process.cwd(), "data");
const paths = await DataPaths.create(root);
await paths.ensureLayout();

console.log(`Data layout ready: ${paths.root}`);
