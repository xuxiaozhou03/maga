import { categoryMappingSchema } from "../config/schemas.js";
import {
  masterEtfFileSchema,
  selectionReportSchema,
  type MasterEtfFile,
  type SelectionReport,
} from "../domain/etf.js";
import type { RawEtf } from "../sources/contracts.js";
import { checksumJson } from "../storage/checksum.js";
import { JsonStore } from "../storage/json-store.js";
import { LockManager } from "../storage/lock-manager.js";
import { PoolRefreshError } from "./errors.js";
import { summarizePoolChanges, type RepresentativeChange } from "./etf-pool-changes.js";
import { selectEtfPool } from "./etf-pool-selector.js";

const MASTER_PATH = "master/etfs.json";
const SELECTION_PATH = "system/selection/latest.json";
const CATEGORY_MAPPING_PATH = "config/etf-category-mapping.json";

export interface EtfPoolSource {
  fetchAll(): Promise<RawEtf[]>;
}

export interface EtfPoolRefreshOptions {
  forcePoolChange?: boolean;
  taskId?: string;
  lockMaxWaitMs?: number;
}

export interface EtfPoolRefreshResult {
  master: MasterEtfFile;
  selection: SelectionReport;
  mappingAdded: number;
  poolVersionBumped: boolean;
  representativeChanges: RepresentativeChange[];
}

export interface EtfPoolServiceDependencies {
  now?: () => Date;
  premiumRateScale?: "percent" | "fraction";
}

export class EtfPoolService {
  private readonly now: () => Date;
  private readonly premiumRateScale: "percent" | "fraction";

  constructor(
    private readonly source: EtfPoolSource,
    private readonly store: JsonStore,
    private readonly locks: LockManager,
    dependencies: EtfPoolServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.premiumRateScale = dependencies.premiumRateScale ?? "percent";
  }

  async refresh(options: EtfPoolRefreshOptions = {}): Promise<EtfPoolRefreshResult> {
    const rawItems = await this.source.fetchAll();
    return this.refreshFromRaw(rawItems, options);
  }

  async refreshFromRaw(
    rawItems: RawEtf[],
    options: EtfPoolRefreshOptions = {},
  ): Promise<EtfPoolRefreshResult> {
    const selection = selectEtfPool(rawItems, { premiumRateScale: this.premiumRateScale });
    if (selection.items.length === 0) {
      throw new PoolRefreshError(
        "POOL_EMPTY",
        "Refusing to replace the research pool with an empty list",
        {
          sourceTotal: selection.sourceTotal,
        },
      );
    }

    const fetchedAt = this.now().toISOString();
    const taskId = options.taskId ?? `pool-refresh-${Date.parse(fetchedAt)}`;

    return this.locks.withLock(
      "master",
      { taskId, reason: "research_pool_refresh" },
      async () => {
        const previous = await this.store.read(MASTER_PATH, masterEtfFileSchema);
        enforcePoolSizeGuard(
          previous?.items.length ?? 0,
          selection.items.length,
          options.forcePoolChange,
        );

        const changes = summarizePoolChanges(previous?.items ?? [], selection.items);
        const poolVersion = previous
          ? changes.membershipChanged
            ? previous.poolVersion + 1
            : previous.poolVersion
          : 1;

        const report: SelectionReport = {
          fetchedAt,
          sourceTotal: selection.sourceTotal,
          poolCount: selection.items.length,
          reasons: selection.reasons,
          afterBasicFilter: selection.afterBasicFilter,
          duplicateGroups: selection.duplicateGroups,
          maxGroupSize: selection.maxGroupSize,
          representativeChanges: changes.representativeChanges,
          rejected: selection.rejected,
        };
        const master: MasterEtfFile = {
          schemaVersion: 1,
          poolVersion,
          poolHash: checksumJson(selection.items),
          updatedAt: fetchedAt,
          sourceFetchedAt: fetchedAt,
          sourceTotal: selection.sourceTotal,
          items: selection.items,
        };

        const mappingAdded = await this.addPendingCategoryMappings(selection.items, fetchedAt);
        await this.store.writeAtomic(MASTER_PATH, master, masterEtfFileSchema);
        await this.store.writeAtomic(SELECTION_PATH, report, selectionReportSchema);

        return {
          master,
          selection: report,
          mappingAdded,
          poolVersionBumped: (previous?.poolVersion ?? 0) !== poolVersion,
          representativeChanges: changes.representativeChanges,
        };
      },
      { maxWaitMs: options.lockMaxWaitMs ?? 60_000 },
    );
  }

  private async addPendingCategoryMappings(
    poolItems: MasterEtfFile["items"],
    updatedAt: string,
  ): Promise<number> {
    const mapping = await this.store.read(CATEGORY_MAPPING_PATH, categoryMappingSchema);
    const existingCodes = new Set(mapping?.items.map((item) => item.etfCode) ?? []);
    const additions = poolItems
      .filter((etf) => !existingCodes.has(etf.code))
      .sort((left, right) => left.code.localeCompare(right.code))
      .map((etf) => ({
        etfCode: etf.code,
        primaryCode: null,
        secondaryCode: null,
        status: "pending" as const,
        reason: "研究池刷新自动创建，待人工确认",
        confidence: 0,
        updatedAt,
      }));

    if (additions.length === 0) {
      return 0;
    }

    if (!mapping) {
      await this.store.writeAtomic(
        CATEGORY_MAPPING_PATH,
        {
          schemaVersion: 1,
          version: 1,
          updatedAt,
          items: additions,
        },
        categoryMappingSchema,
      );
      return additions.length;
    }

    await this.store.writeAtomic(
      CATEGORY_MAPPING_PATH,
      {
        ...mapping,
        version: mapping.version + 1,
        updatedAt,
        items: [...mapping.items, ...additions],
      },
      categoryMappingSchema,
    );

    return additions.length;
  }
}

function enforcePoolSizeGuard(
  previousCount: number,
  nextCount: number,
  force: boolean | undefined,
): void {
  if (previousCount === 0 || force) {
    return;
  }

  const ratio = nextCount / previousCount;
  if (ratio < 0.7 || ratio > 1.3) {
    throw new PoolRefreshError(
      "POOL_CHANGE_GUARD",
      `Research pool size changed outside 70%-130%: ${previousCount} -> ${nextCount}`,
      { previousCount, nextCount, ratio },
    );
  }
}
