import type { IndexValuationItem } from "../domain/valuation.js";
import { inputDigestSchema, type InputDigest } from "../domain/snapshot.js";
import type { Kline } from "../sources/types.js";
import { checksumJson } from "../storage/checksum.js";

export interface BuildInputDigestInput {
  analysisDate: string;
  algorithmVersion: string;
  configHash: string;
  ruleConfigHash: string;
  categoryMappingHash: string;
  poolHash: string;
  klinesByCode: ReadonlyMap<string, readonly Kline[]>;
  valuationsByCode: ReadonlyMap<string, readonly IndexValuationItem[]>;
}

interface DigestKlineRow {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number | null;
  change: number;
  changePercent: number;
}

export function buildInputDigest(input: BuildInputDigestInput): InputDigest {
  const etfs = [...input.klinesByCode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, rows]) => {
      const normalized = normalizeKlineRows(code, rows, input.analysisDate);
      return {
        code,
        firstDate: normalized[0]?.date ?? null,
        lastDate: normalized.at(-1)?.date ?? null,
        rowCount: normalized.length,
        rowsHash: checksumJson(normalized),
      };
    });

  const valuations = [...input.valuationsByCode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([code, items]) => digestValuations(code, items, input.analysisDate));

  return inputDigestSchema.parse({
    analysisDate: input.analysisDate,
    algorithmVersion: input.algorithmVersion,
    configHash: input.configHash,
    ruleConfigHash: input.ruleConfigHash,
    categoryMappingHash: input.categoryMappingHash,
    poolHash: input.poolHash,
    etfs,
    valuations,
  });
}

export function fingerprintOfInputDigest(digest: InputDigest): string {
  return checksumJson(inputDigestSchema.parse(digest));
}

function normalizeKlineRows(
  code: string,
  rows: readonly Kline[],
  analysisDate: string,
): DigestKlineRow[] {
  const future = rows.find((row) => row.date > analysisDate);
  if (future !== undefined) {
    throw new Error(`Future Kline row for ${code}: ${future.date} > ${analysisDate}`);
  }
  const mismatched = rows.find((row) => row.code !== code);
  if (mismatched !== undefined) {
    throw new Error(`Kline code mismatch: expected ${code}, found ${mismatched.code}`);
  }

  const sorted = [...rows].sort((left, right) => left.date.localeCompare(right.date));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1]?.date === sorted[index]?.date) {
      throw new Error(`Duplicate Kline date for ${code}: ${sorted[index]?.date}`);
    }
  }
  return sorted.map((row): DigestKlineRow => ({
    code: row.code,
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    amount: row.amount,
    change: row.change,
    changePercent: row.changePercent,
  }));
}

function digestValuations(
  code: string,
  items: readonly IndexValuationItem[],
  analysisDate: string,
): InputDigest["valuations"] {
  const future = items.find((item) => item.date > analysisDate);
  if (future !== undefined) {
    throw new Error(`Future valuation row for ${code}: ${future.date} > ${analysisDate}`);
  }

  const result: InputDigest["valuations"] = [];
  for (const type of ["PE", "PB", "PS"] as const) {
    const rows = items
      .filter((item) => item.type === type)
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((item) => ({
        date: item.date,
        value: item.value,
        historicalPercentile: item.historicalPercentile,
        peg: item.peg,
      }));
    if (rows.length === 0) {
      continue;
    }
    result.push({
      code,
      type,
      lastDate: rows.at(-1)?.date ?? analysisDate,
      count: rows.length,
      rowsHash: checksumJson(rows),
    });
  }
  return result;
}
