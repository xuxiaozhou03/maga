import type { DateString, EtfCode, Kline } from "../sources/types.js";
import type { DataPaths } from "../storage/data-paths.js";
import { DataError } from "../storage/errors.js";
import type { JsonStore } from "../storage/json-store.js";
import { isRealDate } from "../domain/date.js";
import {
  isEtfCode,
  klineCacheFileSchema,
  MAX_KLINE_CACHE_ROWS,
  type ChartKlineRow,
  type KlineCacheFile,
} from "../domain/kline.js";

export interface DailyKlineSource {
  fetchDaily(code: EtfCode, endDate: DateString, limit: number): Promise<Kline[]>;
}

export interface KlineCacheServiceDependencies {
  maxRows?: number;
  now?: () => Date;
}

export interface WriteKlineCacheOptions {
  analysisDate: DateString;
  updatedAt: string;
}

export class KlineCacheService {
  private readonly maxRows: number;
  private readonly now: () => Date;

  constructor(
    private readonly store: JsonStore,
    private readonly paths: DataPaths,
    dependencies: KlineCacheServiceDependencies = {},
  ) {
    this.maxRows = dependencies.maxRows ?? MAX_KLINE_CACHE_ROWS;
    this.now = dependencies.now ?? (() => new Date());

    if (!Number.isInteger(this.maxRows) || this.maxRows <= 0) {
      throw new Error(`Invalid Kline cache row limit: ${this.maxRows}`);
    }
    if (this.maxRows > MAX_KLINE_CACHE_ROWS) {
      throw new Error(`Kline cache row limit exceeds ${MAX_KLINE_CACHE_ROWS}: ${this.maxRows}`);
    }
  }

  async read(code: EtfCode, analysisDate?: DateString): Promise<KlineCacheFile | null> {
    assertEtfCode(code);
    if (analysisDate !== undefined) {
      assertAnalysisDate(analysisDate);
    }

    const cache = await this.store.read(this.paths.klineCacheFile(code), klineCacheFileSchema);
    if (!cache) {
      return null;
    }
    if (cache.code !== code) {
      throw new DataError({
        code: "DATA_CORRUPT",
        message: `Kline cache code mismatch: expected ${code}, found ${cache.code}`,
        path: this.paths.klineCacheFile(code),
      });
    }

    if (analysisDate === undefined) {
      return cache;
    }
    return {
      ...cache,
      rows: cache.rows.filter((row) => row.date <= analysisDate),
    };
  }

  async write(
    code: EtfCode,
    rows: readonly Kline[],
    options: WriteKlineCacheOptions,
  ): Promise<KlineCacheFile> {
    assertEtfCode(code);
    assertAnalysisDate(options.analysisDate);
    if (!options.updatedAt) {
      throw new DataError({
        code: "SCHEMA_INVALID",
        message: "Kline cache updatedAt is required",
        path: this.paths.klineCacheFile(code),
      });
    }

    const future = rows.find((row) => row.date > options.analysisDate);
    if (future) {
      throw new DataError({
        code: "SCHEMA_INVALID",
        message: `Kline row is later than analysis date: ${future.date} > ${options.analysisDate}`,
        path: this.paths.klineCacheFile(code),
      });
    }
    const mismatched = rows.find((row) => row.code !== code);
    if (mismatched) {
      throw new DataError({
        code: "SCHEMA_INVALID",
        message: `Kline row code mismatch: expected ${code}, found ${mismatched.code}`,
        path: this.paths.klineCacheFile(code),
      });
    }

    const canonicalRows = [...rows]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-this.maxRows)
      .map(toCacheRow);
    const cache: KlineCacheFile = {
      code,
      updatedAt: options.updatedAt,
      source: "hongsehuojian",
      adjust: 1,
      rows: canonicalRows,
    };

    await this.store.writeAtomic(this.paths.klineCacheFile(code), cache, klineCacheFileSchema);
    return cache;
  }

  async refresh(
    code: EtfCode,
    analysisDate: DateString,
    source: DailyKlineSource,
  ): Promise<KlineCacheFile> {
    assertEtfCode(code);
    assertAnalysisDate(analysisDate);

    const rows = await source.fetchDaily(code, analysisDate, this.maxRows);
    return this.write(code, rows, {
      analysisDate,
      updatedAt: this.now().toISOString(),
    });
  }
}

function toCacheRow(row: Kline): ChartKlineRow {
  return {
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    amount: row.amount,
  };
}

function assertEtfCode(code: EtfCode): void {
  if (!isEtfCode(code)) {
    throw new DataError({
      code: "PATH_ESCAPE",
      message: `Invalid ETF code for Kline cache: ${code}`,
      path: code,
    });
  }
}

function assertAnalysisDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isRealDate(value)) {
    throw new DataError({
      code: "SCHEMA_INVALID",
      message: `Invalid analysis date: ${value}`,
    });
  }
}
