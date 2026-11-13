import type { Bar } from "../engine/types.js";

export const SINGLE_FEATURES = [
  "ret_1w",
  "ret_1m",
  "ret_3m",
  "vol_20d",
  "max_dd_60d",
  "ma_dev_20d",
  "turnover_20d",
  "val_percent",
] as const;

export function computeSingleFeatures(
  bars: Bar[],
  valuations: { date: number; percent: number }[],
): { date: number; name: string; value: number }[] {
  const out: { date: number; name: string; value: number }[] = [];
  const valMap = new Map(valuations.map((v) => [v.date, v.percent]));
  const mean = (values: number[]) =>
    values.reduce((total, value) => total + value, 0) / values.length;
  const annualizedVol = (closes: number[]) => {
    const returns = closes.slice(1).map((close, i) => close / closes[i] - 1);
    const average = mean(returns);
    const variance = mean(returns.map((value) => (value - average) ** 2));
    return Math.sqrt(variance) * Math.sqrt(252);
  };
  const maxDrawdown = (closes: number[]) => {
    let peak = closes[0];
    let drawdown = 0;
    for (const close of closes) {
      peak = Math.max(peak, close);
      drawdown = Math.min(drawdown, close / peak - 1);
    }
    return drawdown;
  };

  for (let i = 0; i < bars.length; i++) {
    const date = bars[i].date;
    const push = (name: string, value: number | null) => {
      if (value != null && Number.isFinite(value)) {
        out.push({ date, name, value });
      }
    };

    if (i >= 5) push("ret_1w", bars[i].close / bars[i - 5].close - 1);
    if (i >= 21) push("ret_1m", bars[i].close / bars[i - 21].close - 1);
    if (i >= 63) push("ret_3m", bars[i].close / bars[i - 63].close - 1);
    if (i >= 20) {
      const closes = bars.slice(i - 19, i + 1).map((bar) => bar.close);
      const average = mean(closes);
      push("vol_20d", annualizedVol(closes));
      push("ma_dev_20d", bars[i].close / average - 1);
      push(
        "turnover_20d",
        mean(bars.slice(i - 19, i + 1).map((bar) => bar.amount)),
      );
    }
    if (i >= 60) {
      push(
        "max_dd_60d",
        maxDrawdown(bars.slice(i - 59, i + 1).map((bar) => bar.close)),
      );
    }

    const valuationPercent = valMap.get(date);
    if (valuationPercent != null) {
      push("val_percent", valuationPercent);
    }
  }
  return out;
}
