import type { CalculationConfig } from "../config/schemas.js";
import type { Etf } from "../domain/etf.js";
import {
  etfFeatureFileSchema,
  type ActivityFeatures,
  type CategoryAssignment,
  type EtfFeatureFile,
  type ReturnsFeatures,
  type RiskFeatures,
  type TrendFeatures,
} from "../domain/features.js";
import type { IndexValuationItem } from "../domain/valuation.js";
import type { Kline } from "../sources/types.js";
import { calculateActivity, countAmountSamples20d } from "./activity.js";
import { calculateHistoryFeatures } from "./history.js";
import { calculateReturns } from "./returns.js";
import { calculateRisk } from "./risk.js";
import { calculateTrend } from "./trend.js";
import { calculateValuationFeatures } from "./valuation.js";

export interface CalculateEtfFeatureFileInput {
  etf: Pick<Etf, "code" | "name" | "exchange">;
  analysisDate: string;
  category: CategoryAssignment;
  klines: readonly Kline[];
  valuations: readonly IndexValuationItem[];
  config: CalculationConfig;
  computedAt: string;
}

export function calculateEtfFeatureFile(input: CalculateEtfFeatureFileInput): EtfFeatureFile {
  const rows = prepareRows(input.klines, input.analysisDate);
  const latestKlineDate = rows.at(-1)?.date ?? null;
  const sampleValid = latestKlineDate !== null && latestKlineDate === input.analysisDate;
  const amountSampleCount20d = countAmountSamples20d(rows);
  const warnings = buildWarnings(rows.length, sampleValid);

  const file: EtfFeatureFile = {
    schemaVersion: 1,
    code: input.etf.code,
    name: input.etf.name,
    exchange: input.etf.exchange,
    analysisDate: input.analysisDate,
    latestKlineDate,
    category: input.category,
    dataQuality: {
      sampleValid,
      klineRows: rows.length,
      firstKlineDate: rows[0]?.date ?? null,
      lastKlineDate: latestKlineDate,
      amountSampleCount20d,
      warnings,
    },
    features: {
      returns: sampleValid
        ? calculateReturns(rows, input.analysisDate, input.config)
        : emptyReturns(),
      trend: sampleValid ? calculateTrend(rows, input.config) : emptyTrend(),
      risk: sampleValid ? calculateRisk(rows, input.config) : emptyRisk(),
      activity: sampleValid
        ? calculateActivity(rows, input.config)
        : emptyActivity(amountSampleCount20d),
      valuation: calculateValuationFeatures(input.valuations, input.analysisDate, input.config),
      history: calculateHistoryFeatures(rows, input.analysisDate, input.config),
    },
    computedAt: input.computedAt,
  };

  return etfFeatureFileSchema.parse(file);
}

function prepareRows(klines: readonly Kline[], analysisDate: string): Kline[] {
  const rows = klines
    .filter((row) => row.date <= analysisDate)
    .sort((left, right) => left.date.localeCompare(right.date));
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1]?.date === rows[index]?.date) {
      throw new Error(`Duplicate Kline date in feature input: ${rows[index]?.date}`);
    }
  }
  return rows;
}

function buildWarnings(rowCount: number, sampleValid: boolean): string[] {
  if (rowCount === 0) {
    return ["KLINE_EMPTY"];
  }
  return sampleValid ? [] : ["KLINE_STALE"];
}

function emptyReturns(): ReturnsFeatures {
  return {
    "1d": null,
    "5d": null,
    "20d": null,
    "60d": null,
    "120d": null,
    "250d": null,
    ytd: null,
  };
}

function emptyTrend(): TrendFeatures {
  return {
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
}

function emptyRisk(): RiskFeatures {
  return {
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
}

function emptyActivity(amountSampleCount20d: number): ActivityFeatures {
  return {
    amount: null,
    averageAmount5d: null,
    averageAmount20d: null,
    averageAmount60d: null,
    amountRatio20d: null,
    amountRatio60d: null,
    amountSampleCount20d,
  };
}
