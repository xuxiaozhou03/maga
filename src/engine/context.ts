import type { Bar, Context, ValuationSnap } from "./types.js";

export interface BuildContextOpts {
  date: number;
  codes: string[];
  cash: number;
  positions: Record<string, number>;
  equity: number;
  barsByCode: Map<string, Bar[]>;
  trackOf: Map<string, string>;
  valuationMap: Map<string, ValuationSnap>;
  featureMap: Map<string, number>;
  targetWeightsRef: { value: Record<string, number>; set: boolean };
  manualOrders: { code: string; side: "buy" | "sell"; shares: number }[];
  logger: (message: string) => void;
}

export function buildContext(options: BuildContextOpts): Context {
  return {
    date: options.date,
    codes: options.codes,
    equity: options.equity,
    cash: options.cash,
    positions: { ...options.positions },
    get targetWeights() {
      return { ...options.targetWeightsRef.value };
    },
    getBars(code, lookback) {
      const all = options.barsByCode.get(code) ?? [];
      let end = all.length;
      while (end > 0 && all[end - 1].date > options.date) end--;
      const visible = all.slice(0, end);
      return lookback ? visible.slice(-lookback) : visible;
    },
    getValuation(code, type, date) {
      if (date > options.date) return null;
      const trackIndex = options.trackOf.get(code);
      if (!trackIndex) return null;
      return (
        options.valuationMap.get(`${trackIndex}|${type}|${date}`) ?? null
      );
    },
    getFeature(code, name) {
      return (
        options.featureMap.get(`${code}|${name}|${options.date}`) ?? null
      );
    },
    setTargetWeight(weights) {
      options.targetWeightsRef.value = { ...weights };
      options.targetWeightsRef.set = true;
    },
    order(code, side, shares) {
      options.manualOrders.push({ code, side, shares });
    },
    log(message) {
      options.logger(message);
    },
  };
}
