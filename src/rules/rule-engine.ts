import {
  findingsFileSchema,
  type Finding,
  type FindingSeverity,
  type FindingsFile,
} from "../domain/findings.js";
import { ETF_RULES } from "./etf-rules.js";
import { MARKET_RULES } from "./market-rules.js";
import type { FindingDraft, RuleContext, RuleDefinition, RuleEvaluationInput } from "./types.js";

export interface RuleEvaluationResult {
  market: FindingsFile;
  etfs: FindingsFile;
  warnings: string[];
  notEvaluatedRules: string[];
}

export const SUPPORTED_RULE_CODES = [...ETF_RULES, ...MARKET_RULES].map((rule) => rule.code).sort();

const MAX_MARKET_FINDINGS = 10;
const MAX_ETF_FINDINGS = 500;
const MAX_FINDINGS_PER_ETF = 5;
const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

export function evaluateRules(input: RuleEvaluationInput): RuleEvaluationResult {
  const definitions = new Map<string, RuleDefinition>(
    [...ETF_RULES, ...MARKET_RULES].map((rule) => [rule.code, rule]),
  );
  const context: RuleContext = {
    analysisDate: input.analysisDate,
    snapshotVersion: input.snapshotVersion,
    features: [...input.features].sort((left, right) => left.code.localeCompare(right.code)),
    rankings: input.rankings,
    market: input.market,
    previousTrendScores: input.previousTrendScores,
  };
  const warnings: string[] = [];
  const drafts: FindingDraft[] = [];
  const notEvaluatedRules: string[] = [];
  let attemptedRules = 0;
  let failedRules = 0;

  const configuredRules = [...input.ruleConfig.rules].sort((left, right) =>
    left.code.localeCompare(right.code),
  );
  for (const rule of configuredRules) {
    if (!rule.enabled) {
      continue;
    }
    const definition = definitions.get(rule.code);
    if (definition === undefined) {
      warnings.push(`RULE_UNSUPPORTED:${rule.code}`);
      continue;
    }
    if (rule.code === "etf_trend_improving" && context.previousTrendScores === null) {
      notEvaluatedRules.push(rule.code);
      continue;
    }

    attemptedRules += 1;
    try {
      const ruleDrafts = definition.evaluate(context, rule);
      if (ruleDrafts.length > rule.maxFindings) {
        warnings.push(
          `FINDINGS_TRUNCATED_RULE:${rule.code}:${ruleDrafts.length - rule.maxFindings}`,
        );
      }
      drafts.push(...ruleDrafts.slice(0, rule.maxFindings));
    } catch (error) {
      failedRules += 1;
      warnings.push(
        `RULE_FAILED:${rule.code}:${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (attemptedRules > 0 && failedRules === attemptedRules) {
    throw new Error("All enabled rule evaluations failed");
  }

  const findings = deduplicate(
    drafts.map((draft) =>
      toFinding(
        draft,
        input.ruleConfig.rules.find((rule) => rule.code === draft.ruleCode),
        input.ruleConfig.ruleVersion,
        input.analysisDate,
        input.snapshotVersion,
      ),
    ),
  ).sort(compareFindings);
  const marketFindings = capFindings(
    findings.filter((finding) => finding.level === "market"),
    MAX_MARKET_FINDINGS,
    "MARKET_FINDINGS_TRUNCATED",
    warnings,
  );
  const etfFindings = capPerEtf(
    findings.filter((finding) => finding.level === "etf"),
    MAX_FINDINGS_PER_ETF,
    warnings,
  );
  const cappedEtfFindings = capFindings(
    etfFindings,
    MAX_ETF_FINDINGS,
    "ETF_FINDINGS_TRUNCATED",
    warnings,
  );

  return {
    market: findingsFileSchema.parse({
      schemaVersion: 1,
      analysisDate: input.analysisDate,
      snapshotVersion: input.snapshotVersion,
      level: "market",
      ruleVersion: input.ruleConfig.ruleVersion,
      items: marketFindings,
    }),
    etfs: findingsFileSchema.parse({
      schemaVersion: 1,
      analysisDate: input.analysisDate,
      snapshotVersion: input.snapshotVersion,
      level: "etf",
      ruleVersion: input.ruleConfig.ruleVersion,
      items: cappedEtfFindings,
    }),
    warnings: [...new Set(warnings)].sort(),
    notEvaluatedRules: [...new Set(notEvaluatedRules)].sort(),
  };
}

function toFinding(
  draft: FindingDraft,
  rule: RuleEvaluationInput["ruleConfig"]["rules"][number] | undefined,
  ruleVersion: string,
  analysisDate: string,
  snapshotVersion: number,
): Finding {
  if (rule === undefined) {
    throw new Error(`Finding references unconfigured rule: ${draft.ruleCode}`);
  }
  const id =
    draft.level === "market"
      ? `market:${draft.ruleCode}:${analysisDate}`
      : `etf:${draft.etfCode}:${draft.ruleCode}:${analysisDate}`;
  return {
    id,
    ruleCode: draft.ruleCode,
    ruleVersion,
    level: draft.level,
    ...(draft.etfCode === undefined ? {} : { etfCode: draft.etfCode }),
    severity: rule.severity,
    title: draft.title,
    description: draft.description,
    evidence: draft.evidence,
    thresholds: draft.thresholds,
    snapshotRef: { analysisDate, snapshotVersion },
  };
}

function deduplicate(findings: readonly Finding[]): Finding[] {
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    if (!unique.has(finding.id)) {
      unique.set(finding.id, finding);
    }
  }
  return [...unique.values()];
}

function compareFindings(left: Finding, right: Finding): number {
  const severity = SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity];
  if (severity !== 0) {
    return severity;
  }
  const rule = left.ruleCode.localeCompare(right.ruleCode);
  if (rule !== 0) {
    return rule;
  }
  return (left.etfCode ?? "").localeCompare(right.etfCode ?? "");
}

function capPerEtf(findings: readonly Finding[], limit: number, warnings: string[]): Finding[] {
  const counts = new Map<string, number>();
  const kept: Finding[] = [];
  let dropped = 0;
  for (const finding of findings) {
    const code = finding.etfCode ?? "";
    const count = counts.get(code) ?? 0;
    if (count >= limit) {
      dropped += 1;
      continue;
    }
    counts.set(code, count + 1);
    kept.push(finding);
  }
  if (dropped > 0) {
    warnings.push(`ETF_FINDINGS_TRUNCATED_PER_ETF:${dropped}`);
  }
  return kept;
}

function capFindings(
  findings: readonly Finding[],
  limit: number,
  warningCode: string,
  warnings: string[],
): Finding[] {
  if (findings.length <= limit) {
    return [...findings];
  }
  warnings.push(`${warningCode}:${findings.length - limit}`);
  return findings.slice(0, limit);
}
