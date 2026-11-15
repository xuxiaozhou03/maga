import type { MasterEtfFile } from "../domain/etf.js";
import { masterEtfFileSchema } from "../domain/etf.js";
import { isRealDate } from "../domain/date.js";
import {
  indexValuationFileSchema,
  type IndexValuationFile,
  type ValuationCoverage,
  type ValuationType,
} from "../domain/valuation.js";
import { VALUATION_TYPES } from "../domain/valuation.js";
import type { IndexCode, RawValuation, SourceLogger } from "../sources/types.js";
import { silentLogger } from "../sources/types.js";
import type { DataPaths } from "../storage/data-paths.js";
import type { JsonStore } from "../storage/json-store.js";
import type { LockManager } from "../storage/lock-manager.js";
import { ValuationRefreshError } from "./errors.js";
import {
  deriveCoverage,
  emptyIndexValuationFile,
  mergeValuationItems,
  normalizeRawValuations,
} from "./valuation-normalizer.js";

const MASTER_PATH = "master/etfs.json";

export interface ValuationSource {
  fetch(indexCode: IndexCode, type: ValuationType): Promise<RawValuation[]>;
}

export interface ValuationRefreshOptions {
  analysisDate: string;
  taskId?: string;
  lockMaxWaitMs?: number;
}

export interface ValuationTypeRefreshResult {
  type: ValuationType;
  status: "updated" | "unsupported" | "failed";
  receivedCount: number;
  acceptedCount: number;
  error: string | null;
}

export interface IndexValuationRefreshResult {
  code: IndexCode;
  status: "updated" | "partial" | "unsupported" | "failed";
  fileWritten: boolean;
  types: ValuationTypeRefreshResult[];
  error: string | null;
}

export interface ValuationRefreshResult {
  analysisDate: string;
  indexCount: number;
  indexes: IndexValuationRefreshResult[];
}

export interface ValuationServiceDependencies {
  now?: () => Date;
  logger?: SourceLogger;
}

export class ValuationService {
  private readonly now: () => Date;
  private readonly logger: SourceLogger;

  constructor(
    private readonly source: ValuationSource,
    private readonly store: JsonStore,
    private readonly paths: DataPaths,
    private readonly locks: LockManager,
    dependencies: ValuationServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.logger = dependencies.logger ?? silentLogger;
  }

  async refreshFromMaster(options: ValuationRefreshOptions): Promise<ValuationRefreshResult> {
    const analysisDate = assertAnalysisDate(options.analysisDate);
    const master = await this.store.read(MASTER_PATH, masterEtfFileSchema);
    if (!master) {
      throw new ValuationRefreshError("POOL_MISSING", `Research pool is missing: ${MASTER_PATH}`, {
        path: MASTER_PATH,
      });
    }

    const indexCodes = extractUniqueIndexCodes(master);
    if (indexCodes.length === 0) {
      throw new ValuationRefreshError("POOL_EMPTY", "Research pool contains no index codes", {
        poolCount: master.items.length,
      });
    }

    return this.refreshIndexes(indexCodes, { ...options, analysisDate });
  }

  async refreshIndexes(
    indexCodes: readonly IndexCode[],
    options: ValuationRefreshOptions,
  ): Promise<ValuationRefreshResult> {
    const analysisDate = assertAnalysisDate(options.analysisDate);
    const codes = [...new Set(indexCodes)].sort();
    const runTime = this.now();
    const collectedAt = runTime.toISOString();
    const taskId = options.taskId ?? `valuation-refresh-${runTime.getTime()}`;
    const indexes: IndexValuationRefreshResult[] = [];

    for (const code of codes) {
      try {
        indexes.push(
          await this.refreshIndex(code, {
            analysisDate,
            collectedAt,
            taskId,
            lockMaxWaitMs: options.lockMaxWaitMs ?? 60_000,
          }),
        );
      } catch (error) {
        const message = errorMessage(error);
        this.logger.error(
          { event: "valuation_index_failed", indexCode: code, error: message },
          "Valuation index refresh failed",
        );
        indexes.push(failedIndexResult(code, message));
      }
    }

    return {
      analysisDate,
      indexCount: indexes.length,
      indexes,
    };
  }

  private async refreshIndex(
    code: IndexCode,
    context: {
      analysisDate: string;
      collectedAt: string;
      taskId: string;
      lockMaxWaitMs: number;
    },
  ): Promise<IndexValuationRefreshResult> {
    return this.locks.withLock(
      `valuation-${code}.lock`,
      { taskId: context.taskId, reason: "valuation_history_refresh" },
      async () => {
        const path = this.paths.valuationIndexFile(code);
        const existing = await this.store.read(path, indexValuationFileSchema);
        if (existing && existing.code !== code) {
          throw new Error(`Valuation file code mismatch: expected ${code}, found ${existing.code}`);
        }

        const base = existing ?? emptyIndexValuationFile(code, context.collectedAt);
        let items = base.items;
        const supported = {
          PE: base.coverage.PE.supported,
          PB: base.coverage.PB.supported,
          PS: base.coverage.PS.supported,
        } satisfies Record<ValuationType, boolean>;
        const types: ValuationTypeRefreshResult[] = [];

        for (const type of VALUATION_TYPES) {
          try {
            const rawItems = await this.source.fetch(code, type);
            if (rawItems.length === 0) {
              supported[type] = false;
              this.logger.info(
                { event: "valuation_unsupported", indexCode: code, type },
                "Valuation type has no upstream data",
              );
              types.push({
                type,
                status: "unsupported",
                receivedCount: 0,
                acceptedCount: 0,
                error: null,
              });
              continue;
            }

            const normalized = normalizeRawValuations(rawItems, {
              code,
              type,
              analysisDate: context.analysisDate,
              collectedAt: context.collectedAt,
              logger: this.logger,
            });
            if (normalized.items.length === 0) {
              types.push({
                type,
                status: "failed",
                receivedCount: rawItems.length,
                acceptedCount: 0,
                error: "No valid valuation rows remained after normalization",
              });
              continue;
            }

            items = mergeValuationItems(items, normalized.items, type);
            supported[type] = true;
            types.push({
              type,
              status: "updated",
              receivedCount: rawItems.length,
              acceptedCount: normalized.items.length,
              error: null,
            });
          } catch (error) {
            const message = errorMessage(error);
            this.logger.error(
              { event: "valuation_type_failed", indexCode: code, type, error: message },
              "Valuation type refresh failed",
            );
            types.push({
              type,
              status: "failed",
              receivedCount: 0,
              acceptedCount: 0,
              error: message,
            });
          }
        }

        const anyChange = types.some((result) => result.status !== "failed");
        if (!anyChange) {
          return summarizeIndex(code, types, false, null);
        }

        const coverage: ValuationCoverage = deriveCoverage(items, supported);
        const file: IndexValuationFile = {
          schemaVersion: 1,
          code,
          updatedAt: context.collectedAt,
          coverage,
          items,
        };
        await this.store.writeAtomic(path, file, indexValuationFileSchema);
        return summarizeIndex(code, types, true, null);
      },
      { maxWaitMs: context.lockMaxWaitMs },
    );
  }
}

export function extractUniqueIndexCodes(master: MasterEtfFile): IndexCode[] {
  return [...new Set(master.items.map((item) => item.trackIndex))].sort();
}

function summarizeIndex(
  code: IndexCode,
  types: ValuationTypeRefreshResult[],
  fileWritten: boolean,
  error: string | null,
): IndexValuationRefreshResult {
  const failed = types.filter((result) => result.status === "failed").length;
  const updated = types.filter((result) => result.status === "updated").length;
  const unsupported = types.filter((result) => result.status === "unsupported").length;

  let status: IndexValuationRefreshResult["status"];
  if (failed === types.length) {
    status = "failed";
  } else if (updated === 0 && failed === 0 && unsupported === types.length) {
    status = "unsupported";
  } else if (failed > 0) {
    status = "partial";
  } else {
    status = "updated";
  }

  return { code, status, fileWritten, types, error };
}

function failedIndexResult(code: IndexCode, message: string): IndexValuationRefreshResult {
  return {
    code,
    status: "failed",
    fileWritten: false,
    types: VALUATION_TYPES.map((type) => ({
      type,
      status: "failed" as const,
      receivedCount: 0,
      acceptedCount: 0,
      error: message,
    })),
    error: message,
  };
}

function assertAnalysisDate(value: string): string {
  if (!isRealDate(value)) {
    throw new ValuationRefreshError("INVALID_ANALYSIS_DATE", `Invalid analysis date: ${value}`, {
      analysisDate: value,
    });
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
