export interface DatedClose {
  date: string;
  close: number;
}

export interface DrawdownResult {
  maxDrawdown: number;
  peakDate: string | null;
  troughDate: string | null;
}

export function roundTo(value: number, digits = 12): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cannot round a non-finite number: ${value}`);
  }
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

export function standardDeviation(values: readonly number[], ddof = 0): number | null {
  if (values.length === 0 || values.length <= ddof) {
    return null;
  }
  const average = mean(values);
  if (average === null) {
    return null;
  }
  const squared = values.reduce((sum, value) => sum + (value - average) ** 2, 0);
  return Math.sqrt(squared / (values.length - ddof));
}

export function dailyReturns(closes: readonly number[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1];
    const current = closes[index];
    if (previous === undefined || current === undefined || previous === 0) {
      throw new Error(`Invalid close sequence at index ${index}`);
    }
    returns.push(current / previous - 1);
  }
  return returns;
}

export function calculateDrawdown(points: readonly DatedClose[]): DrawdownResult {
  if (points.length === 0) {
    return { maxDrawdown: 0, peakDate: null, troughDate: null };
  }

  const first = points[0];
  if (!first) {
    return { maxDrawdown: 0, peakDate: null, troughDate: null };
  }
  let peak = first.close;
  let peakDate = first.date;
  let maxDrawdown = 0;
  let troughDate: string | null = null;
  let drawdownPeakDate: string | null = null;

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (!point) {
      continue;
    }
    if (point.close > peak) {
      peak = point.close;
      peakDate = point.date;
    }
    const drawdown = point.close / peak - 1;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      drawdownPeakDate = peakDate;
      troughDate = point.date;
    }
  }

  return {
    maxDrawdown,
    peakDate: drawdownPeakDate,
    troughDate,
  };
}

export function validAmountAverage(
  amounts: readonly (number | null)[],
  denominator: number,
  minimumRatio: number,
): { average: number | null; sampleCount: number } {
  const valid = amounts.filter((amount): amount is number => amount !== null);
  const sampleCount = valid.length;
  if (denominator <= 0 || sampleCount / denominator < minimumRatio) {
    return { average: null, sampleCount };
  }
  return { average: mean(valid), sampleCount };
}

export function maximumPositiveStreak(returns: readonly number[]): number {
  return maximumStreak(returns, (value) => value > 0);
}

export function maximumNegativeStreak(returns: readonly number[]): number {
  return maximumStreak(returns, (value) => value < 0);
}

export function countNewHighs(closes: readonly number[]): number {
  if (closes.length < 2) {
    return 0;
  }
  let runningMaximum = closes[0] ?? Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const close of closes.slice(1)) {
    if (close > runningMaximum) {
      count += 1;
      runningMaximum = close;
    }
  }
  return count;
}

function maximumStreak(values: readonly number[], predicate: (value: number) => boolean): number {
  let current = 0;
  let maximum = 0;
  for (const value of values) {
    if (predicate(value)) {
      current += 1;
      maximum = Math.max(maximum, current);
    } else {
      current = 0;
    }
  }
  return maximum;
}
