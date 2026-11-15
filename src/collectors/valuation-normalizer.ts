import type { RawValuation, SourceLogger } from "../sources/types.js";
import { isRealDate } from "../domain/date.js";
import type {
  IndexValuationFile,
  IndexValuationItem,
  ValuationCoverage,
  ValuationType,
} from "../domain/valuation.js";
import { VALUATION_TYPES } from "../domain/valuation.js";

export interface NormalizeValuationOptions {
  code: string;
  type: ValuationType;
  analysisDate: string;
  collectedAt: string;
  logger?: SourceLogger;
}

export interface ValuationNormalizationWarnings {
  invalidDate: number;
  futureDate: number;
  invalidValue: number;
  invalidPercentile: number;
  duplicateDate: number;
}

export interface NormalizedValuations {
  items: IndexValuationItem[];
  warnings: ValuationNormalizationWarnings;
}

export function normalizeRawValuations(
  rawItems: readonly RawValuation[],
  options: NormalizeValuationOptions,
): NormalizedValuations {
  const warnings: ValuationNormalizationWarnings = {
    invalidDate: 0,
    futureDate: 0,
    invalidValue: 0,
    invalidPercentile: 0,
    duplicateDate: 0,
  };
  const byDate = new Map<string, IndexValuationItem>();

  for (const raw of rawItems) {
    const date = normalizeValuationDate(raw.tradeDate);
    if (!date) {
      warnings.invalidDate += 1;
      continue;
    }
    if (date > options.analysisDate) {
      warnings.futureDate += 1;
      continue;
    }
    if (!Number.isFinite(raw.valuationValue)) {
      warnings.invalidValue += 1;
      continue;
    }

    const historicalPercentile = normalizePercentile(raw.historicalPercentile, warnings);
    const peg = options.type === "PE" ? finiteOrNull(raw.peg) : null;
    if (byDate.has(date)) {
      warnings.duplicateDate += 1;
    }

    byDate.set(date, {
      date,
      type: options.type,
      value: raw.valuationValue,
      historicalPercentile,
      peg,
      pegUsable: peg !== null && peg > 0,
      source: "hongsehuojian",
      collectedAt: options.collectedAt,
    });
  }

  logWarnings(options, warnings);

  return {
    items: [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)),
    warnings,
  };
}

export function mergeValuationItems(
  existingItems: readonly IndexValuationItem[],
  incomingItems: readonly IndexValuationItem[],
  type: ValuationType,
): IndexValuationItem[] {
  const incomingDates = new Set(incomingItems.map((item) => item.date));
  return [
    ...existingItems.filter((item) => item.type !== type || !incomingDates.has(item.date)),
    ...incomingItems,
  ].sort(compareValuationItems);
}

export function deriveCoverage(
  items: readonly IndexValuationItem[],
  supported: Record<ValuationType, boolean>,
): ValuationCoverage {
  return Object.fromEntries(
    VALUATION_TYPES.map((type) => {
      const rows = items.filter((item) => item.type === type);
      return [
        type,
        {
          supported: supported[type],
          lastDate: rows.at(-1)?.date ?? null,
          count: rows.length,
        },
      ];
    }),
  ) as ValuationCoverage;
}

export function emptyValuationCoverage(): ValuationCoverage {
  return {
    PE: { supported: false, lastDate: null, count: 0 },
    PB: { supported: false, lastDate: null, count: 0 },
    PS: { supported: false, lastDate: null, count: 0 },
  };
}

export function emptyIndexValuationFile(code: string, updatedAt: string): IndexValuationFile {
  return {
    schemaVersion: 1,
    code,
    updatedAt,
    coverage: emptyValuationCoverage(),
    items: [],
  };
}

function normalizeValuationDate(value: string): string | null {
  if (/^\d{8}$/.test(value)) {
    const normalized = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    return isRealDate(normalized) ? normalized : null;
  }
  return isRealDate(value) ? value : null;
}

function normalizePercentile(
  value: number | null,
  warnings: ValuationNormalizationWarnings,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    warnings.invalidPercentile += 1;
    return null;
  }
  return value / 100;
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function logWarnings(
  options: NormalizeValuationOptions,
  warnings: ValuationNormalizationWarnings,
): void {
  if (Object.values(warnings).every((count) => count === 0) || !options.logger) {
    return;
  }
  options.logger.warn(
    {
      event: "valuation_normalization_warnings",
      indexCode: options.code,
      type: options.type,
      ...warnings,
    },
    "Valuation rows were normalized with warnings",
  );
}

function compareValuationItems(left: IndexValuationItem, right: IndexValuationItem): number {
  const dateOrder = left.date.localeCompare(right.date);
  return dateOrder || VALUATION_TYPES.indexOf(left.type) - VALUATION_TYPES.indexOf(right.type);
}
