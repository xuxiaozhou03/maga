import { Kline } from "@maga/db";
import { ForwardLabel } from "./types";
import {
  pctChange,
  maxDrawdown,
  sortKlines,
  isFiniteNumber,
  directionOf,
} from "./utils";

function forwardReturn(
  closes: number[],
  i: number,
  horizon: number,
): number | null {
  if (i + horizon >= closes.length) return null;
  return pctChange(closes[i + horizon], closes[i]);
}

function forwardMaxGain(
  klines: Kline[],
  i: number,
  horizon: number,
): number | null {
  if (i + horizon >= klines.length) return null;
  const base = klines[i].close;
  const futureHigh = Math.max(
    ...klines.slice(i + 1, i + horizon + 1).map((k) => k.high),
  );
  return pctChange(futureHigh, base);
}

function forwardMaxLoss(
  klines: Kline[],
  i: number,
  horizon: number,
): number | null {
  if (i + horizon >= klines.length) return null;
  const base = klines[i].close;
  const futureLow = Math.min(
    ...klines.slice(i + 1, i + horizon + 1).map((k) => k.low),
  );
  return pctChange(futureLow, base);
}

function forwardMaxDrawdown(
  klines: Kline[],
  i: number,
  horizon: number,
): number | null {
  if (i + horizon >= klines.length) return null;
  const slice = klines.slice(i, i + horizon + 1).map((k) => k.close);
  return maxDrawdown(slice);
}

export function calculateForwardLabels(
  code: string,
  rawKlines: Kline[],
): ForwardLabel[] {
  const klines = sortKlines(rawKlines).filter(
    (k) => isFiniteNumber(k.date) && isFiniteNumber(k.close) && k.close > 0,
  );
  const closes = klines.map((k) => k.close);

  return klines.map((k, i) => {
    const fr1 = forwardReturn(closes, i, 1);
    const fr5 = forwardReturn(closes, i, 5);
    const fr10 = forwardReturn(closes, i, 10);
    const fr20 = forwardReturn(closes, i, 20);
    const fr60 = forwardReturn(closes, i, 60);

    return {
      code,
      date: k.date,
      forwardReturn1: fr1,
      forwardReturn5: fr5,
      forwardReturn10: fr10,
      forwardReturn20: fr20,
      forwardReturn60: fr60,
      forwardDirection1: directionOf(fr1),
      forwardDirection5: directionOf(fr5),
      forwardDirection10: directionOf(fr10),
      forwardDirection20: directionOf(fr20),
      forwardDirection60: directionOf(fr60),
      forwardMaxGain5: forwardMaxGain(klines, i, 5),
      forwardMaxGain20: forwardMaxGain(klines, i, 20),
      forwardMaxLoss5: forwardMaxLoss(klines, i, 5),
      forwardMaxLoss20: forwardMaxLoss(klines, i, 20),
      forwardMaxDrawdown20: forwardMaxDrawdown(klines, i, 20),
      isMature1: fr1 !== null,
      isMature5: fr5 !== null,
      isMature10: fr10 !== null,
      isMature20: fr20 !== null,
      isMature60: fr60 !== null,
    };
  });
}
