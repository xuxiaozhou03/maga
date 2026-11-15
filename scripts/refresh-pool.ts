import { ConfigLoader } from "../src/config/loader.js";
import { EtfPoolService } from "../src/collectors/etf-pool-service.js";
import { createSources } from "../src/sources/factory.js";
import { DataPaths } from "../src/storage/data-paths.js";
import { JsonStore } from "../src/storage/json-store.js";
import { LockManager } from "../src/storage/lock-manager.js";

const forcePoolChange = process.argv.includes("--force-pool-change");
const loader = await ConfigLoader.create();
const config = await loader.loadAll();
const paths = await DataPaths.create();
const store = new JsonStore(paths);
const locks = new LockManager(paths);
const sources = createSources(config.source);
const service = new EtfPoolService(sources.etfs, store, locks, {
  premiumRateScale: config.source.premiumRateScale,
});

const result = await service.refresh({ forcePoolChange });

console.log(`研究池刷新完成：poolCount=${result.master.items.length}`);
console.log(`poolVersion=${result.master.poolVersion} poolHash=${result.master.poolHash}`);
console.log(
  `sourceTotal=${result.selection.sourceTotal} afterBasicFilter=${result.selection.afterBasicFilter}`,
);
console.log(
  `duplicateGroups=${result.selection.duplicateGroups} maxGroupSize=${result.selection.maxGroupSize}`,
);
console.log(
  `mappingAdded=${result.mappingAdded} representativeChanges=${result.representativeChanges.length}`,
);
