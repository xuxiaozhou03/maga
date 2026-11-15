import { readFile } from "node:fs/promises";
import { calculationConfigSchema, type CalculationConfig } from "../../src/config/schemas.js";
import type { Kline } from "../../src/sources/types.js";

export const CODE = "510300.SH";

export async function loadCalculationConfig(): Promise<CalculationConfig> {
  const path = new URL("../../data/config/calculation-config.json", import.meta.url);
  return calculationConfigSchema.parse(JSON.parse(await readFile(path, "utf8")) as unknown);
}

export function makeKline(date: string, close: number, amount: number | null = 1_000): Kline {
  return {
    code: CODE,
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
    amount,
    change: 0,
    changePercent: 0,
  };
}

export function dateAt(start: string, offsetDays: number): string {
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function rowsFromCloses(
  closes: readonly number[],
  options: { start?: string; amount?: (index: number) => number | null } = {},
): Kline[] {
  const start = options.start ?? "2025-01-01";
  return closes.map((close, index) =>
    makeKline(
      dateAt(start, index),
      close,
      options.amount ? options.amount(index) : 1_000 + index * 10,
    ),
  );
}
