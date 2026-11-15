import type {
  ReportCitation,
  ReportContent,
  ReportKeyFinding,
  ReportSection,
} from "../domain/report.js";
import { uniqueCitations } from "./citations.js";
import type { ReportContext, ReportEtfContext } from "./context.js";

export interface TemplateReportResult {
  content: ReportContent;
  citations: ReportCitation[];
}

export function buildTemplateReport(context: ReportContext): TemplateReportResult {
  const market = context.market;
  const returns20d = market.returns["20d"];
  const state = market.state;
  const warnings = context.dataQuality.warnings;

  const overviewSection: ReportSection = {
    heading: "市场概览",
    body: `${context.analysisDate} 的市场状态为“${state.label}”（${state.code}），匹配规则 ${state.matchedRule}。研究池中 20 日收益有效样本 ${count(returns20d.validCount)} 只，收益中位数 ${percent(returns20d.median)}，上涨比例 ${percent(returns20d.positiveRatio)}；60 日收益中位数为 ${percent(market.returns["60d"].median)}。`,
    citations: [
      citation("market/state.json", "/code"),
      citation("market/state.json", "/label"),
      citation("market/state.json", "/matchedRule"),
      citation("market/returns.json", "/returns/20d/median"),
      citation("market/returns.json", "/returns/20d/validCount"),
      citation("market/returns.json", "/returns/20d/positiveRatio"),
      citation("market/returns.json", "/returns/60d/median"),
    ],
  };

  const trendRiskSection: ReportSection = {
    heading: "趋势与风险",
    body: `趋势有效样本 ${count(market.trend.validCount)} 只，其中均线多头排列比例 ${percent(market.trend.bullishRatio)}，站上 20 日均线比例 ${percent(market.trend.aboveMa20Ratio)}。20 日平均波动率 ${percent(market.risk.meanVolatility20d)}，高回撤样本比例 ${percent(market.risk.highDrawdownRatio)}，平均风险分 ${decimal(market.risk.meanRiskScore)}。`,
    citations: [
      citation("market/trend.json", "/trend/validCount"),
      citation("market/trend.json", "/trend/bullishRatio"),
      citation("market/trend.json", "/trend/aboveMa20Ratio"),
      citation("market/risk.json", "/risk/meanVolatility20d"),
      citation("market/risk.json", "/risk/highDrawdownRatio"),
      citation("market/risk.json", "/risk/meanRiskScore"),
    ],
  };

  const pe = market.valuation.pe;
  const activityValuationSection: ReportSection = {
    heading: "成交与估值",
    body: `成交活跃度有效样本 ${count(market.activity.ratioValidCount)} 只，20 日平均成交额比 ${percent(market.activity.meanAmountRatio20d)}，放量样本比例 ${percent(market.activity.expandedRatio)}。PE 估值中位百分位 ${percent(pe.medianPercentile)}；PE 百分位偏低样本 ${count(pe.lowCount)} 只，偏高样本 ${count(pe.highCount)} 只，估值有效 ETF ${count(pe.validEtfCount)} 只。估值仅描述历史百分位，不构成方向判断。`,
    citations: [
      citation("market/activity.json", "/activity/ratioValidCount"),
      citation("market/activity.json", "/activity/meanAmountRatio20d"),
      citation("market/activity.json", "/activity/expandedRatio"),
      citation("market/valuation.json", "/valuation/pe/medianPercentile"),
      citation("market/valuation.json", "/valuation/pe/lowCount"),
      citation("market/valuation.json", "/valuation/pe/highCount"),
      citation("market/valuation.json", "/valuation/pe/validEtfCount"),
    ],
  };

  const strongWeakSection = buildStrongWeakSection(context);
  const findingsSection = buildFindingsSection(context);

  const qualityWarnings =
    warnings.length === 0
      ? "当前快照未记录数据质量 warning。"
      : `当前快照存在数据质量 warning：${warnings
          .slice(0, 8)
          .map((warning) => warning.code)
          .join("、")}。`;
  const qualitySection: ReportSection = {
    heading: "数据质量",
    body: `快照数据状态为 ${context.dataQuality.dataStatus}。20 日收益有效样本 ${count(returns20d.validCount)} 只，估值有效 ETF ${count(context.dataQuality.valuationValidEtfCount)} 只，估值覆盖率 ${percent(context.dataQuality.valuationCoverage)}。${qualityWarnings}缺失值在报告中保留为“—”，不以 0 替代。`,
    citations: [
      citation("market/overview.json", "/returns/20d/validCount"),
      citation("market/overview.json", "/valuation/valuationValidEtfCount"),
      citation("market/overview.json", "/findings/marketCount"),
    ],
  };

  const sections = [
    overviewSection,
    trendRiskSection,
    activityValuationSection,
    strongWeakSection,
    findingsSection,
    qualitySection,
  ];
  const keyFindings: ReportKeyFinding[] = context.topFindings.slice(0, 10).map((finding) => ({
    ruleCode: finding.ruleCode,
    text: finding.etfCode === null ? finding.title : `${finding.etfCode}：${finding.title}`,
  }));

  return {
    content: {
      title: `${context.analysisDate} ETF 市场观察`,
      summary: `市场状态为“${state.label}”；20 日收益中位数 ${percent(returns20d.median)}，上涨比例 ${percent(returns20d.positiveRatio)}；趋势向上比例 ${percent(market.trend.bullishRatio)}，20 日平均波动率 ${percent(market.risk.meanVolatility20d)}。`,
      sections,
      keyFindings,
    },
    citations: uniqueCitations(sections.flatMap((section) => section.citations)),
  };
}

function buildStrongWeakSection(context: ReportContext): ReportSection {
  const strong = context.strongEtfs.slice(0, 5);
  const weak = context.weakEtfs.slice(0, 5);
  if (strong.length === 0 && weak.length === 0) {
    return {
      heading: "相对强弱",
      body: "当前快照没有可列示的 20 日收益正负样本。",
      citations: [citation("market/returns.json", "/returns/20d/validCount")],
    };
  }

  const sections: string[] = [];
  if (strong.length > 0) {
    sections.push(
      `20 日收益居前：${strong
        .map((etf) => `${etf.name}（${etf.code}）${percent(etf.return20d)}`)
        .join("；")}。`,
    );
  }
  if (weak.length > 0) {
    sections.push(
      `20 日收益居后：${weak
        .map((etf) => `${etf.name}（${etf.code}）${percent(etf.return20d)}`)
        .join("；")}。`,
    );
  }

  const citations = [...strong, ...weak].flatMap((etf) => etfRankingCitations(etf));
  return {
    heading: "相对强弱",
    body: `${sections.join(" ")}排名仅描述样本内相对位置。`,
    citations: uniqueCitations([...citations, citation("rankings/return_20d.json", "/totalCount")]),
  };
}

function buildFindingsSection(context: ReportContext): ReportSection {
  const findings = context.topFindings.slice(0, 6);
  if (findings.length === 0) {
    return {
      heading: "规则发现",
      body: "当前快照没有触发规则发现。规则发现仅用于研究提示，不构成投资建议。",
      citations: [citation("market/overview.json", "/findings/marketCount")],
    };
  }
  return {
    heading: "规则发现",
    body: `${findings
      .map(
        (finding) =>
          `${finding.title}${finding.etfCode === null ? "" : `（${finding.etfCode}）`}：${finding.description}`,
      )
      .join("；")}。`,
    citations: uniqueCitations(
      findings.flatMap((finding) => [
        citation(finding.sourcePath, `/items/${finding.sourceIndex}/title`),
        citation(finding.sourcePath, `/items/${finding.sourceIndex}/description`),
        citation(finding.sourcePath, `/items/${finding.sourceIndex}/severity`),
      ]),
    ),
  };
}

function etfRankingCitations(etf: ReportEtfContext): ReportCitation[] {
  return [
    citation("rankings/return_20d.json", `/items/${etf.rankingIndex}/code`),
    citation("rankings/return_20d.json", `/items/${etf.rankingIndex}/value`),
  ];
}

function citation(path: string, field: string): ReportCitation {
  return { path, field };
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(2)}%`;
}

function decimal(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(4);
}

function count(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}
