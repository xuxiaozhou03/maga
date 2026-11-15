import type { RuleConfig } from "../config/schemas.js";
import type { EtfFeatureFile } from "../domain/features.js";
import type { FindingEvidence, FindingLevel, FindingThresholds } from "../domain/findings.js";
import type { MarketAnalysis } from "../market/market-analysis.js";
import type { RankingCode, RankingFile } from "../domain/rankings.js";

export type RuleDefinitionConfig = RuleConfig["rules"][number];

export interface RuleContext {
  analysisDate: string;
  snapshotVersion: number;
  features: readonly EtfFeatureFile[];
  rankings: Record<RankingCode, RankingFile>;
  market: MarketAnalysis;
  previousTrendScores: ReadonlyMap<string, number> | null;
}

export interface FindingDraft {
  ruleCode: string;
  level: FindingLevel;
  etfCode?: string;
  title: string;
  description: string;
  evidence: FindingEvidence;
  thresholds: FindingThresholds;
}

export interface RuleDefinition {
  code: string;
  level: FindingLevel;
  evaluate(context: RuleContext, rule: RuleDefinitionConfig): FindingDraft[];
}

export interface RuleEvaluationInput {
  analysisDate: string;
  snapshotVersion: number;
  features: readonly EtfFeatureFile[];
  rankings: Record<RankingCode, RankingFile>;
  market: MarketAnalysis;
  ruleConfig: RuleConfig;
  previousTrendScores: ReadonlyMap<string, number> | null;
}
