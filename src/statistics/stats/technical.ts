import type { Kline } from "../../prisma/index.js";
import { sampleStd } from "./utils.js";

/** 支持的技术指标。ATR 是唯一依赖 OHLC 的指标，其余只用 close。 */
export type TechnicalIndicator =
  | "sma"
  | "ema"
  | "macd"
  | "rsi"
  | "boll"
  | "atr";

/**
 * 技术指标结果。所有数组与输入 klines 逐位对齐，长度一致；
 * 数据不足的位置填 null，不用前值补齐。
 */
export interface TechnicalResult {
  dates: number[];
  /** 按周期分组的 SMA：{ 5: [...], 10: [...], 20: [...], 60: [...] } */
  sma: Record<number, Array<number | null>>;
  /** 按周期分组的 EMA：{ 12: [...], 26: [...] } */
  ema: Record<number, Array<number | null>>;
  /** MACD：dif = EMA12 - EMA26；dea = EMA(dif, 9)；histogram = 2 * (dif - dea) */
  macd: {
    dif: Array<number | null>;
    dea: Array<number | null>;
    histogram: Array<number | null>;
  };
  /** RSI(14)，Wilder 平滑 */
  rsi: Array<number | null>;
  /** 布林带(20, 2) */
  boll: {
    middle: Array<number | null>;
    upper: Array<number | null>;
    lower: Array<number | null>;
    bandwidth: Array<number | null>;
    percentB: Array<number | null>;
  };
  /** ATR(14)，Wilder 平滑，依赖 high/low/prevClose */
  atr: Array<number | null>;
}

/**
 * 简单移动平均。
 *
 * 公式：SMA_t(n) = (1/n) * Σ_{i=0}^{n-1} values[t-i]。
 * 边界：t < n-1 时对应位置为 null；用滑动和实现，O(n) 复杂度。
 */
function sma(values: readonly number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * 指数移动平均。
 *
 * 公式：α = 2/(n+1)；EMA_t = α*values[t] + (1-α)*EMA_{t-1}。
 * 初值：EMA_{n-1} = SMA_{n-1}(n)，前 n-1 个位置为 null。
 * 边界：values.length < n 时全 null。
 */
function ema(values: readonly number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period) return out;
  const alpha = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = alpha * values[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

/**
 * 带 null 的 EMA，用于 MACD 的 DEA（输入 dif 序列前段为 null）。
 *
 * 跳过 null 累积种子，凑满 period 个有效值后用其均值作为初值，之后递推。
 * 有效值不足 period 个时全 null。
 */
function emaNullable(
  values: ReadonlyArray<number | null>,
  period: number,
): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  const alpha = 2 / (period + 1);
  let seedSum = 0;
  let seedCount = 0;
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) continue;
    if (prev === null) {
      seedSum += v;
      seedCount++;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
      }
    } else {
      prev = alpha * v + (1 - alpha) * prev;
      out[i] = prev;
    }
  }
  return out;
}

/**
 * RSI，Wilder 平滑口径。
 *
 * 公式：
 *   Δ_t = close[t] - close[t-1]
 *   gain_t = max(Δ_t, 0)，loss_t = max(-Δ_t, 0)
 *   初值：AvgGain = 前 period 个 gain 的均值，AvgLoss 同理
 *   递推：AvgGain_t = (AvgGain_{t-1}*(period-1) + gain_t) / period
 *   RS = AvgGain / AvgLoss；RSI = 100 - 100/(1+RS)
 * 边界：
 *   AvgLoss = 0 时 RSI = 100；AvgGain = 0 时 RSI = 0；
 *   closes.length <= period 时全 null。
 */
function rsiWilder(
  closes: readonly number[],
  period = 14,
): Array<number | null> {
  const out: Array<number | null> = Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gainSum += d;
    else lossSum += -d;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * 真实波幅序列。
 *
 * 公式：TR_t = max(H_t - L_t, |H_t - C_{t-1}|, |L_t - C_{t-1}|)；
 *       首日无前收，TR_0 = H_0 - L_0。
 */
function trueRange(klines: readonly Kline[]): number[] {
  const tr: number[] = [klines[0].high - klines[0].low];
  for (let i = 1; i < klines.length; i++) {
    const { high, low } = klines[i];
    const prevClose = klines[i - 1].close;
    tr.push(
      Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose),
      ),
    );
  }
  return tr;
}

/**
 * ATR，Wilder 平滑口径。
 *
 * 公式：初值 ATR_{period-1} = 前 period 个 TR 的均值；
 *       递推 ATR_t = (ATR_{t-1}*(period-1) + TR_t) / period。
 * 边界：klines.length < period 时全 null。
 * 这是唯一依赖 OHLC 的技术指标。
 */
function atrWilder(
  klines: readonly Kline[],
  period = 14,
): Array<number | null> {
  const tr = trueRange(klines);
  const out: Array<number | null> = Array(klines.length).fill(null);
  if (klines.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < klines.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/**
 * 计算技术指标（L1 为主，ATR 为 L2）。
 *
 * 入参：klines 升序；indicators 指定要计算的指标，未指定的字段填 null 数组。
 * 默认参数：SMA(5/10/20/60)、EMA(12/26)、MACD(12/26/9)、RSI(14)、BOLL(20,2)、ATR(14)。
 * 第一版不开放 params，避免 Record<string, number> 无法表达 MACD 三参数、SMA 多周期的问题。
 *
 * 所有返回数组与 klines 逐位对齐，长度一致；数据不足填 null，不用前值补齐。
 */
export function calculateTechnicalIndicators(
  klines: readonly Kline[],
  indicators: TechnicalIndicator[],
): TechnicalResult {
  const dates = klines.map((k) => k.date);
  const closes = klines.map((k) => k.close);
  const want = new Set(indicators);

  const smaResult: Record<number, Array<number | null>> = {};
  if (want.has("sma")) {
    for (const p of [5, 10, 20, 60]) smaResult[p] = sma(closes, p);
  }

  const emaResult: Record<number, Array<number | null>> = {};
  if (want.has("ema")) {
    for (const p of [12, 26]) emaResult[p] = ema(closes, p);
  }

  let macd = {
    dif: Array<number | null>(closes.length).fill(null) as Array<number | null>,
    dea: Array<number | null>(closes.length).fill(null) as Array<number | null>,
    histogram: Array<number | null>(closes.length).fill(null) as Array<
      number | null
    >,
  };
  if (want.has("macd")) {
    const e12 = ema(closes, 12);
    const e26 = ema(closes, 26);
    const dif = closes.map((_, i) =>
      e12[i] !== null && e26[i] !== null
        ? (e12[i] as number) - (e26[i] as number)
        : null,
    );
    const dea = emaNullable(dif, 9);
    const histogram = dif.map((d, i) =>
      d !== null && dea[i] !== null ? 2 * (d - (dea[i] as number)) : null,
    );
    macd = { dif, dea, histogram };
  }

  const rsi = want.has("rsi")
    ? rsiWilder(closes, 14)
    : (Array<number | null>(closes.length).fill(null) as Array<number | null>);

  let boll = {
    middle: Array<number | null>(closes.length).fill(null) as Array<
      number | null
    >,
    upper: Array<number | null>(closes.length).fill(null) as Array<
      number | null
    >,
    lower: Array<number | null>(closes.length).fill(null) as Array<
      number | null
    >,
    bandwidth: Array<number | null>(closes.length).fill(null) as Array<
      number | null
    >,
    percentB: Array<number | null>(closes.length).fill(null) as Array<
      number | null
    >,
  };
  if (want.has("boll")) {
    const period = 20;
    const mid = sma(closes, period);
    const upper: Array<number | null> = Array(closes.length).fill(null);
    const lower: Array<number | null> = Array(closes.length).fill(null);
    const bw: Array<number | null> = Array(closes.length).fill(null);
    const pb: Array<number | null> = Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      const slice = closes.slice(i - period + 1, i + 1);
      const sd = sampleStd(slice);
      if (sd === null || mid[i] === null) continue;
      const m = mid[i] as number;
      upper[i] = m + 2 * sd;
      lower[i] = m - 2 * sd;
      // 带宽 = (上轨 - 下轨) / 中轨；中轨为 0 时 null
      bw[i] = m !== 0 ? (upper[i]! - lower[i]!) / m : null;
      // %B = (close - 下轨) / (上轨 - 下轨)；分母为 0 时 null
      const denom = upper[i]! - lower[i]!;
      pb[i] = denom !== 0 ? (closes[i] - lower[i]!) / denom : null;
    }
    boll = { middle: mid, upper, lower, bandwidth: bw, percentB: pb };
  }

  const atr = want.has("atr")
    ? atrWilder(klines, 14)
    : (Array<number | null>(klines.length).fill(null) as Array<number | null>);

  return { dates, sma: smaResult, ema: emaResult, macd, rsi, boll, atr };
}
