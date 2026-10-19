import { Kline } from "@maga/db";

export const TRADING_DAYS_PER_YEAR = 252;

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function sortKlines(klines: Kline[]): Kline[] {
  return [...klines].sort((a, b) => a.date - b.date);
}

export function safeDiv(a: number | null, b: number | null): number | null {
  if (!isFiniteNumber(a) || !isFiniteNumber(b) || b === 0) return null;
  return a / b;
}

export function mean(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function std(arr: number[], sample = true): number | null {
  if (arr.length < 2) return null;
  const m = mean(arr);
  if (m === null) return null;
  const denom = sample ? arr.length - 1 : arr.length;
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / denom;
  return Math.sqrt(variance);
}

export function quantile(arr: number[], q: number): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function maxDrawdown(values: number[]): number | null {
  if (values.length < 2) return null;
  let peak = values[0];
  let maxDd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd;
}

export function pctChange(current: number, base: number): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(base) || base === 0)
    return null;
  return current / base - 1;
}

export function rollingSma(
  values: number[],
  window: number,
  index: number,
): number | null {
  if (index < window - 1) return null;
  return mean(values.slice(index - window + 1, index + 1));
}

export function rollingStd(
  values: number[],
  window: number,
  index: number,
): number | null {
  if (index < window - 1) return null;
  return std(values.slice(index - window + 1, index + 1));
}

export function directionOf(r: number | null): "UP" | "DOWN" | "FLAT" | null {
  if (r === null) return null;
  if (r > 0) return "UP";
  if (r < 0) return "DOWN";
  return "FLAT";
}

export function compareDirection(
  current: number | null,
  prev: number | null,
): "UP" | "DOWN" | "FLAT" | null {
  if (current === null || prev === null) return null;
  if (current > prev) return "UP";
  if (current < prev) return "DOWN";
  return "FLAT";
}
