import type { DistributionBin } from "../domain/market.js";
import { roundTo } from "../calculations/math.js";

export function quantileLinear(values: readonly number[], probability: number): number | null {
  if (values.length === 0) {
    return null;
  }
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError("Quantile probability must be between 0 and 1");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined) {
    return null;
  }
  const weight = position - lowerIndex;
  return roundTo(lower + (upper - lower) * weight);
}

export function distribution(
  values: readonly number[],
  bounds: readonly number[],
): DistributionBin[] {
  if (bounds.length < 2) {
    throw new RangeError("Distribution requires at least two bounds");
  }
  for (let index = 1; index < bounds.length; index += 1) {
    const previous = bounds[index - 1];
    const current = bounds[index];
    if (previous === undefined || current === undefined || current <= previous) {
      throw new RangeError("Distribution bounds must be strictly ascending");
    }
  }

  const bins = bounds.slice(0, -1).map((lower, index) => ({
    lower,
    upper: bounds[index + 1] ?? lower,
    count: 0,
  }));

  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }
    for (const [index, bin] of bins.entries()) {
      const isLast = index === bins.length - 1;
      if (value >= bin.lower && (value < bin.upper || (isLast && value <= bin.upper))) {
        bin.count += 1;
        break;
      }
    }
  }

  return bins;
}

export function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return roundTo(numerator / denominator);
}

export function rounded(value: number | null): number | null {
  return value === null ? null : roundTo(value);
}
