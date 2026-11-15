import type { RankingDirection, RankingItem } from "../domain/rankings.js";
import { roundTo } from "../calculations/math.js";

export interface RankableValue {
  code: string;
  value: number | null;
}

export interface RankValuesOptions {
  direction: RankingDirection;
  minSample: number;
  tieTolerance: number;
}

export interface RankValuesResult {
  items: RankingItem[];
  validCount: number;
  insufficientSample: boolean;
}

interface ValidRankableValue {
  code: string;
  value: number;
}

export function rankValues(
  values: readonly RankableValue[],
  options: RankValuesOptions,
): RankValuesResult {
  if (!Number.isInteger(options.minSample) || options.minSample <= 0) {
    throw new RangeError("minSample must be a positive integer");
  }
  if (!Number.isFinite(options.tieTolerance) || options.tieTolerance < 0) {
    throw new RangeError("tieTolerance must be a finite non-negative number");
  }

  const codes = new Set<string>();
  const valid: ValidRankableValue[] = [];
  for (const item of values) {
    if (codes.has(item.code)) {
      throw new Error(`Duplicate ranking input code: ${item.code}`);
    }
    codes.add(item.code);
    if (item.value === null || !Number.isFinite(item.value)) {
      continue;
    }
    valid.push({ code: item.code, value: roundTo(item.value) });
  }

  valid.sort((left, right) => compareValues(left, right, options.direction));
  const ranked = applyCompetitionRanks(valid, options.tieTolerance);
  const insufficientSample = ranked.length < options.minSample;

  return {
    items: insufficientSample ? [] : ranked,
    validCount: ranked.length,
    insufficientSample,
  };
}

export function percentileRankValues(
  values: readonly RankableValue[],
  tieTolerance: number,
): Map<string, number> {
  if (!Number.isFinite(tieTolerance) || tieTolerance < 0) {
    throw new RangeError("tieTolerance must be a finite non-negative number");
  }

  const seen = new Set<string>();
  const valid: ValidRankableValue[] = [];
  for (const item of values) {
    if (seen.has(item.code)) {
      throw new Error(`Duplicate percentile input code: ${item.code}`);
    }
    seen.add(item.code);
    if (item.value === null || !Number.isFinite(item.value)) {
      continue;
    }
    valid.push({ code: item.code, value: roundTo(item.value) });
  }
  valid.sort((left, right) => compareValues(left, right, "asc"));

  const percentiles = new Map<string, number>();
  let previousValue: number | null = null;
  let previousRank = 0;
  for (const [index, item] of valid.entries()) {
    const tied =
      previousValue !== null &&
      Math.abs(item.value - previousValue) <=
        tieTolerance * Math.max(1, Math.abs(item.value), Math.abs(previousValue));
    const rank = tied ? previousRank : index + 1;
    const percentile = valid.length === 1 ? 1 : (rank - 1) / (valid.length - 1);
    percentiles.set(item.code, roundTo(percentile));
    previousValue = item.value;
    previousRank = rank;
  }
  return percentiles;
}

function compareValues(
  left: ValidRankableValue,
  right: ValidRankableValue,
  direction: RankingDirection,
): number {
  if (left.value !== right.value) {
    const valueOrder = left.value < right.value ? -1 : 1;
    return direction === "asc" ? valueOrder : -valueOrder;
  }
  return left.code.localeCompare(right.code);
}

function applyCompetitionRanks(
  values: readonly ValidRankableValue[],
  tolerance: number,
): RankingItem[] {
  const count = values.length;
  const items: RankingItem[] = [];
  let previousValue: number | null = null;
  let previousRank = 0;

  for (const [index, item] of values.entries()) {
    const tied =
      previousValue !== null &&
      Math.abs(item.value - previousValue) <=
        tolerance * Math.max(1, Math.abs(item.value), Math.abs(previousValue));
    const rank = tied ? previousRank : index + 1;
    const percentile = count === 1 ? 1 : (count - rank) / (count - 1);

    items.push({
      rank,
      code: item.code,
      value: item.value,
      percentile: roundTo(percentile),
      sampleValid: true,
    });
    previousValue = item.value;
    previousRank = rank;
  }

  return items;
}
