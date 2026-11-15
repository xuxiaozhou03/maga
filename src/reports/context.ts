import type { EtfFeatureFile } from "../domain/features.js";
import type { Finding } from "../domain/findings.js";
import type { RankingItem } from "../domain/rankings.js";
import type { SnapshotData } from "../snapshots/snapshot-reader.js";

export interface ReportFindingContext {
  ruleCode: string;
  level: "market" | "etf";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  etfCode: string | null;
  sourcePath: string;
  sourceIndex: number;
}

export interface ReportEtfContext {
  code: string;
  name: string;
  categoryStatus: "pending" | "confirmed";
  primaryCode: string | null;
  secondaryCode: string | null;
  return20d: number | null;
  return60d: number | null;
  volatility20d: number | null;
  maxDrawdown60d: number | null;
  pePercentile: number | null;
  rank: number | null;
  percentile: number | null;
  rankingIndex: number;
  findings: string[];
}

export interface ReportContext {
  analysisDate: string;
  snapshotVersion: number;
  market: {
    state: {
      code: string;
      label: string;
      matchedRule: string;
      evidence: SnapshotData["market"]["state"]["evidence"];
    };
    returns: {
      "1d": SnapshotData["market"]["returns"]["returns"]["1d"];
      "20d": SnapshotData["market"]["returns"]["returns"]["20d"];
      "60d": SnapshotData["market"]["returns"]["returns"]["60d"];
    };
    trend: SnapshotData["market"]["trend"]["trend"];
    risk: SnapshotData["market"]["risk"]["risk"];
    activity: SnapshotData["market"]["activity"]["activity"];
    valuation: SnapshotData["market"]["valuation"]["valuation"];
  };
  topFindings: ReportFindingContext[];
  strongEtfs: ReportEtfContext[];
  weakEtfs: ReportEtfContext[];
  riskEtfs: ReportEtfContext[];
  valuationLowEtfs: ReportEtfContext[];
  dataQuality: {
    klineValidCount: number;
    poolCount: number;
    valuationCoverage: number | null;
    valuationValidEtfCount: number;
    dataStatus: "complete" | "partial";
    warnings: Array<{ code: string; message: string }>;
  };
}

const SEVERITY_ORDER: Record<Finding["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function buildReportContext(snapshot: SnapshotData): ReportContext {
  const marketFindings = snapshot.findings.market.items.map((finding, index) => ({
    finding,
    sourcePath: "findings/market.json",
    sourceIndex: index,
  }));
  const etfFindings = snapshot.findings.etfs.items.map((finding, index) => ({
    finding,
    sourcePath: "findings/etfs.json",
    sourceIndex: index,
  }));
  const allFindings = [...marketFindings, ...etfFindings].sort(compareFindingEntries);
  const findingsByCode = new Map<string, string[]>();
  for (const { finding } of allFindings) {
    if (finding.etfCode === undefined) {
      continue;
    }
    const values = findingsByCode.get(finding.etfCode) ?? [];
    values.push(finding.title);
    findingsByCode.set(finding.etfCode, values);
  }

  const returnRanking = snapshot.rankings.return_20d;
  const riskRanking = snapshot.rankings.risk_score;
  const valuationRanking = snapshot.rankings.valuation_pe;

  return {
    analysisDate: snapshot.analysisDate,
    snapshotVersion: snapshot.snapshotVersion,
    market: {
      state: {
        code: snapshot.market.state.code,
        label: snapshot.market.state.label,
        matchedRule: snapshot.market.state.matchedRule,
        evidence: snapshot.market.state.evidence,
      },
      returns: {
        "1d": snapshot.market.returns.returns["1d"],
        "20d": snapshot.market.returns.returns["20d"],
        "60d": snapshot.market.returns.returns["60d"],
      },
      trend: snapshot.market.trend.trend,
      risk: snapshot.market.risk.risk,
      activity: snapshot.market.activity.activity,
      valuation: snapshot.market.valuation.valuation,
    },
    topFindings: allFindings.slice(0, 10).map(({ finding, sourcePath, sourceIndex }) => ({
      ruleCode: finding.ruleCode,
      level: finding.level,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      etfCode: finding.etfCode ?? null,
      sourcePath,
      sourceIndex,
    })),
    strongEtfs: returnRanking.items
      .map((item, rankingIndex) => ({ item, rankingIndex }))
      .filter(({ item }) => item.value > 0)
      .slice(0, 10)
      .map(({ item, rankingIndex }) =>
        makeEtfContext(snapshot, item, rankingIndex, findingsByCode),
      ),
    weakEtfs: returnRanking.items
      .map((item, rankingIndex) => ({ item, rankingIndex }))
      .filter(({ item }) => item.value < 0)
      .slice(-10)
      .reverse()
      .map(({ item, rankingIndex }) =>
        makeEtfContext(snapshot, item, rankingIndex, findingsByCode),
      ),
    riskEtfs: riskRanking.items
      .map((item, rankingIndex) => ({ item, rankingIndex }))
      .slice(-10)
      .reverse()
      .map(({ item, rankingIndex }) =>
        makeEtfContext(snapshot, item, rankingIndex, findingsByCode),
      ),
    valuationLowEtfs: valuationRanking.items
      .map((item, rankingIndex) => ({ item, rankingIndex }))
      .slice(0, 10)
      .map(({ item, rankingIndex }) =>
        makeEtfContext(snapshot, item, rankingIndex, findingsByCode),
      ),
    dataQuality: {
      klineValidCount: snapshot.manifest.klineValidCount,
      poolCount: snapshot.manifest.etfCount,
      valuationCoverage:
        snapshot.manifest.etfCount === 0
          ? null
          : snapshot.manifest.valuationValidEtfCount / snapshot.manifest.etfCount,
      valuationValidEtfCount: snapshot.manifest.valuationValidEtfCount,
      dataStatus: snapshot.manifest.dataStatus,
      warnings: snapshot.manifest.warnings
        .slice(0, 20)
        .map((warning) => ({ code: warning.code, message: warning.message })),
    },
  };
}

function makeEtfContext(
  snapshot: SnapshotData,
  item: RankingItem,
  rankingIndex: number,
  findingsByCode: ReadonlyMap<string, readonly string[]>,
): ReportEtfContext {
  const feature = snapshot.features.get(item.code);
  if (feature === undefined) {
    throw new Error(`Ranking references an unknown ETF: ${item.code}`);
  }
  return {
    code: feature.code,
    name: feature.name,
    categoryStatus: feature.category.status,
    primaryCode: feature.category.primaryCode,
    secondaryCode: feature.category.secondaryCode,
    return20d: feature.features.returns["20d"],
    return60d: feature.features.returns["60d"],
    volatility20d: feature.features.risk.volatility20d,
    maxDrawdown60d: feature.features.risk.maxDrawdown60d,
    pePercentile: feature.features.valuation.pe?.historicalPercentile ?? null,
    rank: item.rank,
    percentile: item.percentile,
    rankingIndex,
    findings: (findingsByCode.get(item.code) ?? []).slice(0, 5),
  };
}

function compareFindingEntries(
  left: {
    finding: Finding;
    sourcePath: string;
    sourceIndex: number;
  },
  right: {
    finding: Finding;
    sourcePath: string;
    sourceIndex: number;
  },
): number {
  const severity = SEVERITY_ORDER[left.finding.severity] - SEVERITY_ORDER[right.finding.severity];
  return (
    severity ||
    left.finding.ruleCode.localeCompare(right.finding.ruleCode) ||
    (left.finding.etfCode ?? "").localeCompare(right.finding.etfCode ?? "") ||
    left.sourcePath.localeCompare(right.sourcePath) ||
    left.sourceIndex - right.sourceIndex
  );
}

export function featureForContext(
  snapshot: SnapshotData,
  code: string,
): EtfFeatureFile | undefined {
  return snapshot.features.get(code);
}
