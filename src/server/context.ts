import { resolve } from "node:path";
import { ConfigLoader, type AppConfig } from "../config/loader.js";
import { KlineCacheService, type DailyKlineSource } from "../charts/kline-cache-service.js";
import { KlineChartService } from "../charts/kline-chart-service.js";
import { ReportService } from "../reports/report-service.js";
import { createReportAiProviderFromEnv, type ReportAiProvider } from "../reports/ai-provider.js";
import { SnapshotReader } from "../snapshots/snapshot-reader.js";
import { createSources } from "../sources/factory.js";
import { DataPaths } from "../storage/data-paths.js";
import { JsonStore } from "../storage/json-store.js";
import { LockManager } from "../storage/lock-manager.js";
import { TaskService } from "../tasks/task-service.js";

export interface AppServices {
  dataRoot: string;
  paths: DataPaths;
  store: JsonStore;
  config: AppConfig;
  snapshots: SnapshotReader;
  tasks: TaskService;
  locks: LockManager;
  reports: ReportService;
  reportAiProvider: ReportAiProvider | null;
  klineCache: KlineCacheService;
  klineChart: KlineChartService;
  klineSource: DailyKlineSource | null;
  now: () => Date;
}

export interface CreateAppServicesOptions {
  dataRoot?: string;
  config?: AppConfig;
  klineSource?: DailyKlineSource | null;
  reportAiProvider?: ReportAiProvider | null;
  now?: () => Date;
}

export function defaultDataRoot(): string {
  return resolve(process.env.DATA_ROOT ?? resolve(process.cwd(), "data"));
}

export async function createAppServices(
  options: CreateAppServicesOptions = {},
): Promise<AppServices> {
  const dataRoot = resolve(options.dataRoot ?? defaultDataRoot());
  const paths = await DataPaths.create(dataRoot);
  await paths.ensureLayout();
  const store = new JsonStore(paths);
  const config = options.config ?? (await (await ConfigLoader.create(dataRoot)).loadAll());
  const now = options.now ?? (() => new Date());
  const klineSource =
    options.klineSource === undefined ? createSources(config.source).klines : options.klineSource;
  const klineCache = new KlineCacheService(store, paths, { now });
  const snapshots = new SnapshotReader(paths, store);
  const tasks = new TaskService(paths, store, { now });
  const locks = new LockManager(paths);
  const reportAiProvider =
    options.reportAiProvider === undefined
      ? createReportAiProviderFromEnv()
      : options.reportAiProvider;
  const reports = new ReportService(paths, store, snapshots, tasks, locks, {
    now,
    aiProvider: reportAiProvider,
  });

  return {
    dataRoot,
    paths,
    store,
    config,
    snapshots,
    tasks,
    locks,
    reports,
    reportAiProvider,
    klineCache,
    klineChart: new KlineChartService(klineCache),
    klineSource,
    now,
  };
}
