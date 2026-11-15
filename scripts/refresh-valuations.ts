import { ConfigLoader } from "../src/config/loader.js";
import { ValuationService } from "../src/collectors/valuation-service.js";
import { getLastTradingDay } from "../src/domain/trading-calendar.js";
import { logger } from "../src/logging.js";
import { createSources } from "../src/sources/factory.js";
import { DataPaths } from "../src/storage/data-paths.js";
import { JsonStore } from "../src/storage/json-store.js";
import { LockManager } from "../src/storage/lock-manager.js";

const loader = await ConfigLoader.create();
const config = await loader.loadAll();
const paths = await DataPaths.create();
const store = new JsonStore(paths);
const locks = new LockManager(paths);
const sources = createSources(config.source, { logger });
const service = new ValuationService(sources.valuations, store, paths, locks, { logger });

const analysisDate = readArgument("--date") ?? getLastTradingDay();
const requestedIndexes = readArguments("--index").flatMap((value) =>
  value
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean),
);
const result =
  requestedIndexes.length > 0
    ? await service.refreshIndexes(requestedIndexes, { analysisDate })
    : await service.refreshFromMaster({ analysisDate });

console.log(`估值刷新完成：analysisDate=${result.analysisDate} indexes=${result.indexCount}`);
for (const index of result.indexes) {
  const coverage = index.types
    .map((type) => `${type.type}:${type.status}(${type.acceptedCount})`)
    .join(" ");
  console.log(
    `${index.code} status=${index.status} written=${index.fileWritten} ${coverage}${index.error ? ` error=${index.error}` : ""}`,
  );
}

if (result.indexes.some((index) => index.status === "failed" || index.status === "partial")) {
  process.exitCode = 1;
}

function readArgument(name: string): string | undefined {
  return readArguments(name)[0];
}

function readArguments(name: string): string[] {
  const values: string[] = [];
  for (const [index, argument] of process.argv.entries()) {
    if (argument === name) {
      const value = process.argv[index + 1];
      if (value && !value.startsWith("--")) {
        values.push(value);
      }
    } else if (argument.startsWith(`${name}=`)) {
      values.push(argument.slice(name.length + 1));
    }
  }
  return values;
}
