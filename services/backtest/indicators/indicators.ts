/**
 * 技术指标。
 *
 * 纯函数，输入为按时间升序的数值序列，输出与输入等长（前置不足为 null）。
 * 只使用当前及历史数据，不引入未来信息。
 */

export type Series = readonly number[];
export type MaybeSeries = (number | null)[];

function assertPeriod(period: number, label = "period"): void {
  if (!Number.isInteger(period) || period <= 0) {
    throw new RangeError(`indicators: ${label} 必须是正整数，收到 ${period}`);
  }
}

/** 简单移动平均。 */
export function sma(values: Series, period: number): MaybeSeries {
  assertPeriod(period);
  const out: MaybeSeries = new Array(values.length).fill(null);
  let windowSum = 0;

  for (let i = 0; i < values.length; i += 1) {
    windowSum += values[i];
    if (i >= period) windowSum -= values[i - period];
    if (i >= period - 1) out[i] = windowSum / period;
  }

  return out;
}

function emaDense(values: Series, period: number): MaybeSeries {
  const out: MaybeSeries = new Array(values.length).fill(null);
  if (values.length < period) return out;

  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }

  return out;
}

/** 指数移动平均，首个值用前 `period` 个数的算术平均做种子。 */
export function ema(values: Series, period: number): MaybeSeries {
  assertPeriod(period);
  return emaDense(values, period);
}

/**
 * RSI（Wilder 平滑）。
 *
 * 需要至少 `period + 1` 个价格才能得到第一个值。
 */
export function rsi(values: Series, period = 14): MaybeSeries {
  assertPeriod(period);
  const out: MaybeSeries = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

export type MacdResult = {
  dif: MaybeSeries;
  dea: MaybeSeries;
  hist: MaybeSeries;
};

/** MACD：DIF = EMA(fast) - EMA(slow)，DEA = EMA(DIF, signal)，HIST = DIF - DEA。 */
export function macd(values: Series, fast = 12, slow = 26, signal = 9): MacdResult {
  assertPeriod(fast, "fast");
  assertPeriod(slow, "slow");
  assertPeriod(signal, "signal");

  const fastEma = emaDense(values, fast);
  const slowEma = emaDense(values, slow);
  const dif: MaybeSeries = values.map((_, i) =>
    fastEma[i] !== null && slowEma[i] !== null ? (fastEma[i] as number) - (slowEma[i] as number) : null,
  );

  const firstIndex = dif.findIndex((value) => value !== null);
  const dea: MaybeSeries = new Array(values.length).fill(null);
  const hist: MaybeSeries = new Array(values.length).fill(null);

  if (firstIndex >= 0) {
    const dense = dif.slice(firstIndex).map((value) => value as number);
    const deaDense = emaDense(dense, signal);
    for (let i = 0; i < deaDense.length; i += 1) {
      dea[firstIndex + i] = deaDense[i];
    }
  }

  for (let i = 0; i < values.length; i += 1) {
    if (dif[i] !== null && dea[i] !== null) {
      hist[i] = (dif[i] as number) - (dea[i] as number);
    }
  }

  return { dif, dea, hist };
}

export type BollingerResult = {
  upper: MaybeSeries;
  middle: MaybeSeries;
  lower: MaybeSeries;
};

/** 布林带：中轨为 SMA，上下轨为中轨 ± multiplier × 总体标准差。 */
export function bollinger(values: Series, period = 20, multiplier = 2): BollingerResult {
  assertPeriod(period);
  const middle = sma(values, period);
  const upper: MaybeSeries = new Array(values.length).fill(null);
  const lower: MaybeSeries = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i += 1) {
    const avg = middle[i] as number;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) variance += (values[j] - avg) ** 2;
    const sd = Math.sqrt(variance / period);
    upper[i] = avg + multiplier * sd;
    lower[i] = avg - multiplier * sd;
  }

  return { upper, middle, lower };
}

/** 取序列中最后一个非空值。 */
export function lastValue(series: MaybeSeries): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i] !== null) return series[i] as number;
  }
  return null;
}

/** 取序列倒数第 `offset` 个非空值（offset=0 即最新）。 */
export function valueAtOffset(series: MaybeSeries, offset: number): number | null {
  if (!Number.isInteger(offset) || offset < 0) return null;
  let seen = 0;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i] === null) continue;
    if (seen === offset) return series[i] as number;
    seen += 1;
  }
  return null;
}
