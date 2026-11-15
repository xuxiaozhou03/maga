import type { EtfFeatureFile } from "../domain/features.js";
import type { RankingItem } from "../domain/rankings.js";
import { formatAmount, formatNumber, formatPercent, requiredParam } from "./format.js";
import type { FindingDraft, RuleContext, RuleDefinition, RuleDefinitionConfig } from "./types.js";

export const ETF_RULES: readonly RuleDefinition[] = [
  returnRankingRule("etf_return20d_top20", "return_20d", "20d", "20日收益"),
  returnRankingRule("etf_return60d_top20", "return_60d", "60d", "60日收益"),
  {
    code: "etf_bullish_alignment",
    level: "etf",
    evaluate: (context, rule) =>
      context.features.flatMap((feature) => {
        const trend = feature.features.trend;
        if (trend.maAlignment !== "bullish") {
          return [];
        }
        return [
          draft(feature, rule, {
            title: rule.description,
            description: `收盘价 ${formatNumber(trend.close ?? 0)} 高于 MA5 ${formatNumber(trend.ma5 ?? 0)}、MA10 ${formatNumber(trend.ma10 ?? 0)}、MA20 ${formatNumber(trend.ma20 ?? 0)}、MA60 ${formatNumber(trend.ma60 ?? 0)}。`,
            evidence: {
              close: trend.close,
              ma5: trend.ma5,
              ma10: trend.ma10,
              ma20: trend.ma20,
              ma60: trend.ma60,
            },
            thresholds: {},
          }),
        ];
      }),
  },
  {
    code: "etf_ma20_overextended",
    level: "etf",
    evaluate: (context, rule) => {
      const threshold = requiredParam(rule, "ma20DeviationThreshold");
      return context.features.flatMap((feature) => {
        const trend = feature.features.trend;
        if (trend.ma20Deviation === null || trend.ma20Deviation < threshold) {
          return [];
        }
        return [
          draft(feature, rule, {
            title: rule.description,
            description: `收盘价 ${formatNumber(trend.close ?? 0)}，MA20 ${formatNumber(trend.ma20 ?? 0)}，偏离 ${formatPercent(trend.ma20Deviation)}，达到 ${formatPercent(threshold)} 阈值。`,
            evidence: {
              close: trend.close,
              ma20: trend.ma20,
              ma20Deviation: trend.ma20Deviation,
            },
            thresholds: { ma20DeviationThreshold: threshold },
          }),
        ];
      });
    },
  },
  {
    code: "etf_volatility_spike",
    level: "etf",
    evaluate: (context, rule) => {
      const volatilityThreshold = requiredParam(rule, "volatility20dThreshold");
      const ratioThreshold = requiredParam(rule, "volatility20dTo60dRatio");
      return context.features.flatMap((feature) => {
        const volatility20d = feature.features.risk.volatility20d;
        const volatility60d = feature.features.risk.volatility60d;
        if (
          volatility20d === null ||
          volatility60d === null ||
          volatility20d < volatilityThreshold ||
          volatility20d < ratioThreshold * volatility60d
        ) {
          return [];
        }
        return [
          draft(feature, rule, {
            title: rule.description,
            description: `20日波动率 ${formatPercent(volatility20d)}，达到 ${formatPercent(volatilityThreshold)}，且不低于60日波动率 ${formatPercent(volatility60d)} 的 ${ratioThreshold} 倍。`,
            evidence: { volatility20d, volatility60d },
            thresholds: {
              volatility20dThreshold: volatilityThreshold,
              volatility20dTo60dRatio: ratioThreshold,
            },
          }),
        ];
      });
    },
  },
  {
    code: "etf_drawdown_warning",
    level: "etf",
    evaluate: (context, rule) => {
      const currentThreshold = requiredParam(rule, "currentDrawdownThreshold");
      const drawdownThreshold = requiredParam(rule, "maxDrawdown60dThreshold");
      return context.features.flatMap((feature) => {
        const risk = feature.features.risk;
        const currentTriggered =
          risk.currentDrawdown !== null && risk.currentDrawdown <= currentThreshold;
        const drawdownTriggered =
          risk.maxDrawdown60d !== null && risk.maxDrawdown60d <= drawdownThreshold;
        if (!currentTriggered && !drawdownTriggered) {
          return [];
        }
        const reasons: string[] = [];
        if (currentTriggered) {
          reasons.push(
            `当前回撤 ${formatPercent(risk.currentDrawdown ?? 0)}，达到 ${formatPercent(currentThreshold)} 阈值`,
          );
        }
        if (drawdownTriggered) {
          reasons.push(
            `60日最大回撤 ${formatPercent(risk.maxDrawdown60d ?? 0)}，达到 ${formatPercent(drawdownThreshold)} 阈值`,
          );
        }
        return [
          draft(feature, rule, {
            title: rule.description,
            description: `${reasons.join("；")}。`,
            evidence: {
              currentDrawdown: risk.currentDrawdown,
              maxDrawdown60d: risk.maxDrawdown60d,
            },
            thresholds: {
              currentDrawdownThreshold: currentThreshold,
              maxDrawdown60dThreshold: drawdownThreshold,
            },
          }),
        ];
      });
    },
  },
  {
    code: "etf_amount_expansion",
    level: "etf",
    evaluate: (context, rule) => {
      const ratioThreshold = requiredParam(rule, "amountRatio20dThreshold");
      const amountThreshold = requiredParam(rule, "minAverageAmount20d");
      return context.features.flatMap((feature) => {
        const activity = feature.features.activity;
        if (
          activity.amountRatio20d === null ||
          activity.averageAmount20d === null ||
          activity.amountRatio20d < ratioThreshold ||
          activity.averageAmount20d < amountThreshold
        ) {
          return [];
        }
        return [
          draft(feature, rule, {
            title: rule.description,
            description: `当日成交额 ${formatAmount(activity.amount ?? 0)}，20日均额 ${formatAmount(activity.averageAmount20d)}，较20日均额放大 ${formatPercent(activity.amountRatio20d)}。`,
            evidence: {
              amount: activity.amount,
              averageAmount20d: activity.averageAmount20d,
              amountRatio20d: activity.amountRatio20d,
            },
            thresholds: {
              amountRatio20dThreshold: ratioThreshold,
              minAverageAmount20d: amountThreshold,
            },
          }),
        ];
      });
    },
  },
  valuationRule("etf_pe_low", "pe", "PE"),
  valuationRule("etf_pb_low", "pb", "PB"),
  valuationRule("etf_ps_low", "ps", "PS"),
  {
    code: "etf_trend_improving",
    level: "etf",
    evaluate: (context, rule) => {
      if (context.previousTrendScores === null) {
        return [];
      }
      const deltaThreshold = requiredParam(rule, "minScoreDelta");
      const currentThreshold = requiredParam(rule, "minCurrentScore");
      return context.features.flatMap((feature) => {
        const currentScore = feature.features.trend.maAlignmentScore;
        const previousScore = context.previousTrendScores?.get(feature.code);
        if (currentScore === null || previousScore === undefined) {
          return [];
        }
        const delta = currentScore - previousScore;
        if (delta < deltaThreshold || currentScore < currentThreshold) {
          return [];
        }
        return [
          draft(feature, rule, {
            title: rule.description,
            description: `MA排列分数由 ${previousScore} 升至 ${currentScore}，提升 ${delta} 分。`,
            evidence: { previousScore, currentScore, scoreDelta: delta },
            thresholds: {
              minScoreDelta: deltaThreshold,
              minCurrentScore: currentThreshold,
            },
          }),
        ];
      });
    },
  },
];

function returnRankingRule(
  code: string,
  rankingCode: "return_20d" | "return_60d",
  key: "20d" | "60d",
  label: string,
): RuleDefinition {
  return {
    code,
    level: "etf",
    evaluate: (context, rule) => {
      const minPercentile = requiredParam(rule, "minPercentile");
      return context.features.flatMap((feature) => {
        const item = rankingItem(context, rankingCode, feature.code);
        const value = feature.features.returns[key];
        if (item === null || value === null || item.percentile < minPercentile) {
          return [];
        }
        return [
          draft(feature, rule, {
            title: rule.description,
            description: `${label} ${formatPercent(value)}，全池排名百分位 ${formatPercent(item.percentile)}，达到前 ${formatPercent(1 - minPercentile)} 阈值。`,
            evidence: {
              [`return${key}`]: value,
              rankPercentile: item.percentile,
              rank: item.rank,
            },
            thresholds: { minPercentile },
          }),
        ];
      });
    },
  };
}

function valuationRule(code: string, key: "pe" | "pb" | "ps", label: string): RuleDefinition {
  return {
    code,
    level: "etf",
    evaluate: (context, rule) => {
      const maxPercentile = requiredParam(rule, "maxPercentile");
      const maxLagDays = requiredParam(rule, "maxLagDays");
      return context.features.flatMap((feature) => {
        const valuation = feature.features.valuation[key];
        if (
          valuation === null ||
          valuation.historicalPercentile === null ||
          valuation.historicalPercentile > maxPercentile ||
          valuation.lagDays > maxLagDays
        ) {
          return [];
        }
        return [
          draft(feature, rule, {
            title: rule.description,
            description: `${label}历史百分位 ${formatPercent(valuation.historicalPercentile)}，不高于 ${formatPercent(maxPercentile)}，估值滞后 ${valuation.lagDays} 天。`,
            evidence: {
              [`${key}Percentile`]: valuation.historicalPercentile,
              lagDays: valuation.lagDays,
            },
            thresholds: { maxPercentile, maxLagDays },
          }),
        ];
      });
    },
  };
}

function rankingItem(
  context: RuleContext,
  rankingCode: "return_20d" | "return_60d",
  code: string,
): RankingItem | null {
  const ranking = context.rankings[rankingCode];
  if (ranking.insufficientSample) {
    return null;
  }
  return ranking.items.find((item) => item.code === code) ?? null;
}

function draft(
  feature: EtfFeatureFile,
  rule: RuleDefinitionConfig,
  content: Omit<FindingDraft, "ruleCode" | "level" | "etfCode">,
): FindingDraft {
  return {
    ruleCode: rule.code,
    level: "etf",
    etfCode: feature.code,
    ...content,
  };
}
