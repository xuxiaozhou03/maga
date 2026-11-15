import type { Etf } from "../../src/domain/etf.js";
import type {
  ActivityFeatures,
  CategoryAssignment,
  EtfFeatureFile,
  ReturnsFeatures,
  RiskFeatures,
  TrendFeatures,
  ValuationFeature,
  ValuationFeatures,
} from "../../src/domain/features.js";

export interface FeatureOverrides {
  code: string;
  analysisDate?: string;
  sampleValid?: boolean;
  category?: Partial<CategoryAssignment>;
  returns?: Partial<ReturnsFeatures>;
  trend?: Partial<TrendFeatures>;
  risk?: Partial<RiskFeatures>;
  activity?: Partial<ActivityFeatures>;
  valuation?: Partial<ValuationFeatures>;
}

const EMPTY_RETURNS: ReturnsFeatures = {
  "1d": null,
  "5d": null,
  "20d": null,
  "60d": null,
  "120d": null,
  "250d": null,
  ytd: null,
};

const EMPTY_TREND: TrendFeatures = {
  close: null,
  ma5: null,
  ma10: null,
  ma20: null,
  ma60: null,
  ma120: null,
  ma20Deviation: null,
  ma60Deviation: null,
  aboveMa20: null,
  aboveMa60: null,
  aboveMa120: null,
  maAlignment: null,
  maAlignmentScore: null,
  boll20: {
    middle: null,
    upper: null,
    lower: null,
    percentB: null,
    bandwidth: null,
  },
};

const EMPTY_RISK: RiskFeatures = {
  volatility20d: null,
  volatility60d: null,
  volatility120d: null,
  maxDrawdown20d: null,
  maxDrawdown60d: null,
  maxDrawdown120d: null,
  maxDrawdown250d: null,
  currentDrawdown: null,
  sampleHigh: null,
  distanceFromSampleHigh: null,
  maxDrawdown60dPeakDate: null,
  maxDrawdown60dTroughDate: null,
};

const EMPTY_ACTIVITY: ActivityFeatures = {
  amount: null,
  averageAmount5d: null,
  averageAmount20d: null,
  averageAmount60d: null,
  amountRatio20d: null,
  amountRatio60d: null,
  amountSampleCount20d: 0,
};

export function makeFeature(overrides: FeatureOverrides): EtfFeatureFile {
  const analysisDate = overrides.analysisDate ?? "2026-11-13";
  const sampleValid = overrides.sampleValid ?? true;
  return {
    schemaVersion: 1,
    code: overrides.code,
    name: `ETF ${overrides.code}`,
    exchange: "SH",
    analysisDate,
    latestKlineDate: sampleValid ? analysisDate : "2026-11-12",
    category: {
      primaryCode: null,
      secondaryCode: null,
      status: "pending",
      mappingVersion: 1,
      ...overrides.category,
    },
    dataQuality: {
      sampleValid,
      klineRows: sampleValid ? 251 : 250,
      firstKlineDate: "2025-11-13",
      lastKlineDate: sampleValid ? analysisDate : "2026-11-12",
      amountSampleCount20d: sampleValid ? 20 : 19,
      warnings: sampleValid ? [] : ["KLINE_STALE"],
    },
    features: {
      returns: { ...EMPTY_RETURNS, ...overrides.returns },
      trend: { ...EMPTY_TREND, ...overrides.trend },
      risk: { ...EMPTY_RISK, ...overrides.risk },
      activity: { ...EMPTY_ACTIVITY, ...overrides.activity },
      valuation: {
        pe: null,
        pb: null,
        ps: null,
        ...overrides.valuation,
      },
      history: {
        "1m": null,
        "3m": null,
        "6m": null,
        ytd: null,
        "1y": null,
        "2y": null,
      },
    },
    computedAt: `${analysisDate}T08:00:00.000Z`,
  };
}

export function makeValuation(
  percentile: number,
  lagDays = 0,
  freshness: "fresh" | "stale" | "too_stale" = "fresh",
): ValuationFeature {
  return {
    value: 1,
    historicalPercentile: percentile,
    date: "2026-11-13",
    lagDays,
    lagTradingDays: lagDays,
    peg: null,
    pegUsable: false,
    source: "hongsehuojian",
    freshness,
  };
}

export function makeEtfLink(code: string, trackIndex: string): Pick<Etf, "code" | "trackIndex"> {
  return { code, trackIndex };
}
