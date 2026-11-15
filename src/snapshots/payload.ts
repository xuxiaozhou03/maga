import type { EtfFeatureFile } from "../domain/features.js";
import type { FindingsFile } from "../domain/findings.js";
import type { RankingCode, RankingFile } from "../domain/rankings.js";
import {
  marketOverviewSchema,
  type InputDigest,
  type MarketOverview,
  type SourceAsOf,
} from "../domain/snapshot.js";
import type { MarketAnalysis } from "../market/market-analysis.js";
import type { WarningItem } from "../domain/warnings.js";

export const SNAPSHOT_MARKET_FILES = [
  "overview",
  "returns",
  "trend",
  "risk",
  "activity",
  "valuation",
  "state",
] as const;

export type SnapshotMarketFile = (typeof SNAPSHOT_MARKET_FILES)[number];

export interface SnapshotPayload {
  analysisDate: string;
  inputDigest: InputDigest;
  algorithmVersion: string;
  configVersion: number;
  configHash: string;
  ruleVersion: string;
  ruleConfigHash: string;
  categoryMappingVersion: number;
  categoryMappingHash: string;
  poolVersion: number;
  poolHash: string;
  sourceAsOf: SourceAsOf;
  features: readonly EtfFeatureFile[];
  rankings: Record<RankingCode, RankingFile>;
  market: MarketAnalysis;
  findings: {
    market: FindingsFile;
    etfs: FindingsFile;
  };
  warnings?: readonly (string | WarningItem)[];
}

export function buildMarketOverview(
  market: MarketAnalysis,
  findings: SnapshotPayload["findings"],
): MarketOverview {
  return marketOverviewSchema.parse({
    schemaVersion: 1,
    analysisDate: market.returns.analysisDate,
    state: {
      code: market.state.code,
      label: market.state.label,
      matchedRule: market.state.matchedRule,
    },
    returns: {
      "1d": {
        median: market.returns.returns["1d"].median,
        positiveRatio: market.returns.returns["1d"].positiveRatio,
        validCount: market.returns.returns["1d"].validCount,
      },
      "20d": {
        median: market.returns.returns["20d"].median,
        positiveRatio: market.returns.returns["20d"].positiveRatio,
        validCount: market.returns.returns["20d"].validCount,
      },
    },
    trend: {
      bullishRatio: market.trend.trend.bullishRatio,
      aboveMa20Ratio: market.trend.trend.aboveMa20Ratio,
      validCount: market.trend.trend.validCount,
    },
    risk: {
      meanVolatility20d: market.risk.risk.meanVolatility20d,
      highDrawdownRatio: market.risk.risk.highDrawdownRatio,
      meanRiskScore: market.risk.risk.meanRiskScore,
      validCount: market.risk.risk.riskScoreValidCount,
    },
    activity: {
      meanAmountRatio20d: market.activity.activity.meanAmountRatio20d,
      expandedRatio: market.activity.activity.expandedRatio,
      validCount: market.activity.activity.ratioValidCount,
    },
    valuation: {
      peMedianPercentile: market.valuation.valuation.pe.medianPercentile,
      pbMedianPercentile: market.valuation.valuation.pb.medianPercentile,
      psMedianPercentile: market.valuation.valuation.ps.medianPercentile,
      valuationValidIndexCount: market.samples.valuationValidIndexCount,
      valuationValidEtfCount: market.samples.valuationValidEtfCount,
    },
    findings: {
      marketCount: findings.market.items.length,
      etfCount: findings.etfs.items.length,
    },
  });
}
