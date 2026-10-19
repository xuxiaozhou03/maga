/* ============================================================
 * 五、每日核心特征（单只 ETF）
 * ============================================================ */

import { Kline } from "@maga/db";
import {
  compareDirection,
  isFiniteNumber,
  mean,
  pctChange,
  rollingSma,
  rollingStd,
  safeDiv,
  sortKlines,
} from "./utils";
import { DailyFeatureCore } from "./types";

function smaAlignment(
  sma20: number | null,
  sma60: number | null,
  sma120: number | null,
): "BULL" | "BEAR" | "MIXED" | null {
  if (sma20 === null || sma60 === null || sma120 === null) return null;
  if (sma20 > sma60 && sma60 > sma120) return "BULL";
  if (sma20 < sma60 && sma60 < sma120) return "BEAR";
  return "MIXED";
}

function rangePosition(
  klines: Kline[],
  index: number,
  window: number,
): number | null {
  if (index < window - 1) return null;
  const slice = klines.slice(index - window + 1, index + 1);
  const high = Math.max(...slice.map((k) => k.high));
  const low = Math.min(...slice.map((k) => k.low));
  const close = klines[index].close;
  if (high === low) return null;
  return (close - low) / (high - low);
}

function distanceToHigh(
  klines: Kline[],
  index: number,
  window: number,
): number | null {
  if (index < window - 1) return null;
  const slice = klines.slice(index - window + 1, index + 1);
  const high = Math.max(...slice.map((k) => k.high));
  return pctChange(klines[index].close, high);
}

function calcTrendState(
  close: number,
  sma20: number | null,
  sma60: number | null,
): "UP" | "DOWN" | "SIDEWAYS" | null {
  if (sma20 === null || sma60 === null) return null;
  if (close > sma20 && sma20 > sma60) return "UP";
  if (close < sma20 && sma20 < sma60) return "DOWN";
  return "SIDEWAYS";
}

function calcMomentumState(
  return20: number | null,
  return60: number | null,
): "STRONG" | "WEAK" | "NEUTRAL" | null {
  if (return20 === null || return60 === null) return null;
  if (return20 > 0 && return60 > 0) return "STRONG";
  if (return20 < 0 && return60 < 0) return "WEAK";
  return "NEUTRAL";
}

function calcVolatilityState(
  vol20: number | null,
  vol60: number | null,
): "HIGH" | "LOW" | "NORMAL" | null {
  if (vol20 === null || vol60 === null || vol60 === 0) return null;
  const ratio = vol20 / vol60;
  if (ratio > 1.2) return "HIGH";
  if (ratio < 0.8) return "LOW";
  return "NORMAL";
}

export function calculateDailyFeatures(
  code: string,
  rawKlines: Kline[],
): DailyFeatureCore[] {
  const klines = sortKlines(rawKlines).filter(
    (k) =>
      isFiniteNumber(k.date) &&
      [k.open, k.high, k.low, k.close].every(
        (p) => isFiniteNumber(p) && p > 0,
      ) &&
      k.high >= k.low,
  );

  const closes = klines.map((k) => k.close);
  const volumes = klines.map((k) => k.volume);
  const amounts = klines.map((k) => k.amount);
  const dailyReturns: (number | null)[] = closes.map((c, i) =>
    i === 0 ? null : pctChange(c, closes[i - 1]),
  );

  const result: DailyFeatureCore[] = [];

  for (let i = 0; i < klines.length; i++) {
    const k = klines[i];
    const close = k.close;

    const sma20 = rollingSma(closes, 20, i);
    const sma60 = rollingSma(closes, 60, i);
    const sma120 = rollingSma(closes, 120, i);
    const sma250 = rollingSma(closes, 250, i);

    const prevSma20 = i > 0 ? rollingSma(closes, 20, i - 1) : null;
    const prevSma60 = i > 0 ? rollingSma(closes, 60, i - 1) : null;

    const return1 = i >= 1 ? pctChange(closes[i], closes[i - 1]) : null;
    const return5 = i >= 5 ? pctChange(closes[i], closes[i - 5]) : null;
    const return10 = i >= 10 ? pctChange(closes[i], closes[i - 10]) : null;
    const return20 = i >= 20 ? pctChange(closes[i], closes[i - 20]) : null;
    const return60 = i >= 60 ? pctChange(closes[i], closes[i - 60]) : null;
    const return120 = i >= 120 ? pctChange(closes[i], closes[i - 120]) : null;
    const return250 = i >= 250 ? pctChange(closes[i], closes[i - 250]) : null;

    const validReturns = dailyReturns
      .slice(0, i)
      .filter((r): r is number => r !== null);
    const vol20 = rollingStd(validReturns, 20, validReturns.length - 1);
    const vol60 = rollingStd(validReturns, 60, validReturns.length - 1);

    const prevVolume = i > 0 ? volumes[i - 1] : null;
    const prevAmount = i > 0 ? amounts[i - 1] : null;
    const avgAmount20 = i >= 19 ? mean(amounts.slice(i - 19, i + 1)) : null;
    const avgVolume20 = i >= 19 ? mean(volumes.slice(i - 19, i + 1)) : null;

    const body = Math.abs(k.close - k.open);
    const range = k.high - k.low;
    const upperShadow = k.high - Math.max(k.open, k.close);
    const lowerShadow = Math.min(k.open, k.close) - k.low;

    result.push({
      code,
      date: k.date,
      return1,
      return5,
      return10,
      return20,
      return60,
      return120,
      return250,
      sma20,
      sma60,
      sma120,
      sma250,
      closeDeviation20: sma20 !== null ? safeDiv(close - sma20, sma20) : null,
      closeDeviation60: sma60 !== null ? safeDiv(close - sma60, sma60) : null,
      closeDeviation120:
        sma120 !== null ? safeDiv(close - sma120, sma120) : null,
      closeDeviation250:
        sma250 !== null ? safeDiv(close - sma250, sma250) : null,
      smaDirection20: compareDirection(sma20, prevSma20),
      smaDirection60: compareDirection(sma60, prevSma60),
      smaAlignment: smaAlignment(sma20, sma60, sma120),
      momentum: return20,
      volatility20: vol20,
      volatility60: vol60,
      distanceToHigh20: distanceToHigh(klines, i, 20),
      distanceToHigh60: distanceToHigh(klines, i, 60),
      distanceToHigh120: distanceToHigh(klines, i, 120),
      distanceToHigh250: distanceToHigh(klines, i, 250),
      rangePosition20: rangePosition(klines, i, 20),
      rangePosition60: rangePosition(klines, i, 60),
      rangePosition120: rangePosition(klines, i, 120),
      rangePosition250: rangePosition(klines, i, 250),
      volumeChangeRate:
        prevVolume !== null ? pctChange(k.volume, prevVolume) : null,
      relativeVolume:
        avgVolume20 !== null && avgVolume20 !== 0
          ? k.volume / avgVolume20
          : null,
      amountChangeRate:
        prevAmount !== null ? pctChange(k.amount, prevAmount) : null,
      relativeAmount20:
        avgAmount20 !== null && avgAmount20 !== 0
          ? k.amount / avgAmount20
          : null,
      bodyRatio: range !== 0 ? body / range : null,
      upperShadowRatio: range !== 0 ? upperShadow / range : null,
      lowerShadowRatio: range !== 0 ? lowerShadow / range : null,
      intradayAmplitude: pctChange(k.high, k.low),
      gap: i > 0 ? pctChange(k.open, klines[i - 1].close) : null,
      trendState: calcTrendState(close, sma20, sma60),
      momentumState: calcMomentumState(return20, return60),
      volatilityState: calcVolatilityState(vol20, vol60),
    });
  }

  return result;
}
