import type { AppConfig } from "../../src/config/loader.js";
import { ConfigLoader } from "../../src/config/loader.js";
import { KlineCacheService, type DailyKlineSource } from "../../src/charts/kline-cache-service.js";
import { createApp } from "../../src/server/app.js";
import { createAppServices, type AppServices } from "../../src/server/context.js";
import { SnapshotService } from "../../src/snapshots/snapshot-service.js";
import type { SnapshotPayload } from "../../src/snapshots/payload.js";
import type { ReportAiProvider } from "../../src/reports/ai-provider.js";
import { JsonStore } from "../../src/storage/json-store.js";
import { LockManager } from "../../src/storage/lock-manager.js";
import { createTempDataRoot, type TempDataRoot } from "../storage/support.js";
import { makeSnapshotFixture, SNAPSHOT_ANALYSIS_DATE } from "./snapshots.js";

export interface TestServer {
  app: ReturnType<typeof createApp>;
  services: AppServices;
  root: TempDataRoot;
  config: AppConfig;
  fixture: ReturnType<typeof makeSnapshotFixture>;
  cleanup(): Promise<void>;
}

export interface CreateTestServerOptions {
  publish?: boolean;
  partial?: boolean;
  confirmFirstEtf?: boolean;
  klineSource?: DailyKlineSource | null;
  reportAiProvider?: ReportAiProvider | null;
  payloadTransform?: (payload: SnapshotPayload) => SnapshotPayload;
}

let cachedConfig: AppConfig | undefined;

export async function loadTestConfig(): Promise<AppConfig> {
  cachedConfig ??= await (await ConfigLoader.create()).loadAll();
  return cachedConfig;
}

export async function createTestServer(options: CreateTestServerOptions = {}): Promise<TestServer> {
  const root = await createTempDataRoot();
  const config = await loadTestConfig();
  const fixture = makeSnapshotFixture(config.calculation);
  if (options.publish !== false) {
    const store = new JsonStore(root.paths);
    const service = new SnapshotService(root.paths, store, new LockManager(root.paths), {
      now: () => new Date("2026-11-15T08:00:00.000Z"),
    });
    await service.publish(
      fixture.digest,
      async (version) => {
        let payload = fixture.makePayload(version);
        if (options.confirmFirstEtf) {
          payload = {
            ...payload,
            features: payload.features.map((feature, index) =>
              index === 0
                ? {
                    ...feature,
                    category: {
                      primaryCode: "broad_market",
                      secondaryCode: "cn_core",
                      status: "confirmed",
                      mappingVersion: 1,
                    },
                  }
                : feature,
            ),
          };
        }
        return options.payloadTransform ? options.payloadTransform(payload) : payload;
      },
      {
        reason: "daily",
        allowPartial: options.partial ?? false,
        requestedDataStatus: options.partial ? "partial" : "complete",
      },
    );
  }

  const services = await createAppServices({
    dataRoot: root.root,
    config,
    klineSource: options.klineSource === undefined ? null : options.klineSource,
    reportAiProvider: options.reportAiProvider === undefined ? null : options.reportAiProvider,
    now: () => new Date("2026-11-15T08:00:00.000Z"),
  });
  return {
    app: createApp(services),
    services,
    root,
    config,
    fixture,
    cleanup: root.cleanup,
  };
}

export function makeNoopKlineSource(): DailyKlineSource {
  return {
    async fetchDaily() {
      throw new Error("Kline source must not be called in this test");
    },
  };
}

export function makeStaticKlineSource(rows: Awaited<ReturnType<DailyKlineSource["fetchDaily"]>>) {
  let calls = 0;
  const source: DailyKlineSource = {
    async fetchDaily(_code, _endDate, _limit) {
      calls += 1;
      return rows;
    },
  };
  return {
    source,
    calls: () => calls,
  };
}

export function makeKlineRows(code: string) {
  return [
    {
      code,
      date: "2026-11-12",
      open: 1,
      high: 1.1,
      low: 0.9,
      close: 1.05,
      volume: 1000,
      amount: 1_000_000,
      change: 0.05,
      changePercent: 0.05,
    },
    {
      code,
      date: SNAPSHOT_ANALYSIS_DATE,
      open: 1.05,
      high: 1.15,
      low: 1,
      close: 1.1,
      volume: 1200,
      amount: 1_200_000,
      change: 0.05,
      changePercent: 0.0476,
    },
  ];
}

export function appKlineCache(root: TempDataRoot): KlineCacheService {
  return new KlineCacheService(new JsonStore(root.paths), root.paths);
}
