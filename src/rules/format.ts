import type { RuleDefinitionConfig } from "./types.js";
import { roundTo } from "../calculations/math.js";

export function requiredParam(rule: RuleDefinitionConfig, name: string): number {
  const value = rule.params[name];
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Rule ${rule.code} is missing numeric parameter: ${name}`);
  }
  return value;
}

export function formatPercent(value: number): string {
  return `${roundTo(value * 100).toFixed(2)}%`;
}

export function formatNumber(value: number, digits = 4): string {
  return roundTo(value).toFixed(digits);
}

export function formatAmount(value: number): string {
  if (Math.abs(value) >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)} 亿`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${(value / 10_000).toFixed(2)} 万`;
  }
  return value.toFixed(2);
}
