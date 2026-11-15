import type { ChartKlineRow } from "../domain/kline.js";

export type KlineAggregationPeriod = "week" | "month";

interface AggregateAccumulator {
  key: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number | null;
  date: string;
}

export function aggregateKlineRows(
  rows: readonly ChartKlineRow[],
  period: KlineAggregationPeriod,
): ChartKlineRow[] {
  const sorted = [...rows].sort((left, right) => left.date.localeCompare(right.date));
  const groups = new Map<string, AggregateAccumulator>();
  let previousDate: string | null = null;

  for (const row of sorted) {
    if (previousDate !== null && row.date === previousDate) {
      throw new Error(`Duplicate Kline date cannot be aggregated: ${row.date}`);
    }
    previousDate = row.date;

    const key = period === "week" ? tradingWeekKey(row.date) : row.date.slice(0, 7);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        amount: row.amount,
        date: row.date,
      });
      continue;
    }

    existing.high = Math.max(existing.high, row.high);
    existing.low = Math.min(existing.low, row.low);
    existing.close = row.close;
    existing.volume += row.volume;
    existing.amount =
      existing.amount === null || row.amount === null ? null : existing.amount + row.amount;
    existing.date = row.date;
  }

  return [...groups.values()].map((group) => ({
    date: group.date,
    open: group.open,
    high: group.high,
    low: group.low,
    close: group.close,
    volume: group.volume,
    amount: group.amount,
  }));
}

export function tradingWeekKey(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  const day = value.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  value.setUTCDate(value.getUTCDate() - daysSinceMonday);
  return value.toISOString().slice(0, 10);
}
