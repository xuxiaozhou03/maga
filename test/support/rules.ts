import { readFile } from "node:fs/promises";
import { ruleConfigSchema, type RuleConfig } from "../../src/config/schemas.js";
import type { EtfFeatureFile } from "../../src/domain/features.js";
import { calculateMarketAnalysis } from "../../src/market/market-analysis.js";
import { calculateEtfRankings } from "../../src/rankings/etf-rankings.js";
import type { RuleContext, RuleDefinitionConfig } from "../../src/rules/types.js";
import { loadCalculationConfig } from "../calculations/support.js";
import { makeEtfLink } from "./features.js";

const ANALYSIS_DATE = "2026-11-13";

export async function loadRuleConfig(): Promise<RuleConfig> {
  const path = new URL("../../data/config/rule-config.json", import.meta.url);
  return ruleConfigSchema.parse(JSON.parse(await readFile(path, "utf8")) as unknown);
}

export async function makeRuleContext(
  features: readonly EtfFeatureFile[],
  previousTrendScores: ReadonlyMap<string, number> | null = null,
): Promise<RuleContext> {
  const calculation = await loadCalculationConfig();
  const rankings = calculateEtfRankings({
    features,
    analysisDate: ANALYSIS_DATE,
    snapshotVersion: 1,
    config: calculation,
  });
  const market = calculateMarketAnalysis({
    features,
    etfs: features.map((feature, index) => makeEtfLink(feature.code, `IDX${index}.SH`)),
    analysisDate: ANALYSIS_DATE,
    config: calculation,
  });
  return {
    analysisDate: ANALYSIS_DATE,
    snapshotVersion: 1,
    features,
    rankings,
    market,
    previousTrendScores,
  };
}

export function ruleByCode(config: RuleConfig, code: string): RuleDefinitionConfig {
  const rule = config.rules.find((item) => item.code === code);
  if (rule === undefined) {
    throw new Error(`Missing rule configuration: ${code}`);
  }
  return rule;
}

export function onlyRules(
  config: RuleConfig,
  enabledCodes: readonly string[],
  overrides: Readonly<Record<string, Partial<RuleDefinitionConfig>>> = {},
): RuleConfig {
  return {
    ...config,
    rules: config.rules.map((rule) => {
      const override = overrides[rule.code];
      return {
        ...rule,
        ...override,
        enabled: enabledCodes.includes(rule.code),
      };
    }),
  };
}
