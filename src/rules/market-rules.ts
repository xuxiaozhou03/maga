import { formatPercent, requiredParam } from "./format.js";
import type { FindingDraft, RuleContext, RuleDefinition, RuleDefinitionConfig } from "./types.js";

export const MARKET_RULES: readonly RuleDefinition[] = [
  {
    code: "market_breadth_strong",
    level: "market",
    evaluate: (context, rule) => {
      const threshold = requiredParam(rule, "positiveRatio1dMin");
      const stats = context.market.returns.returns["1d"];
      if (stats.positiveRatio === null || stats.positiveRatio < threshold) {
        return [];
      }
      return [
        draft(rule, {
          title: rule.description,
          description: `研究池内 ${formatPercent(stats.positiveRatio)} 的 ETF 当日上涨（${stats.upCount}/${stats.validCount}）。`,
          evidence: {
            positiveRatio1d: stats.positiveRatio,
            upCount: stats.upCount,
            validCount: stats.validCount,
          },
          thresholds: { positiveRatio1dMin: threshold },
        }),
      ];
    },
  },
  {
    code: "market_breadth_weak",
    level: "market",
    evaluate: (context, rule) => {
      const threshold = requiredParam(rule, "positiveRatio1dMax");
      const stats = context.market.returns.returns["1d"];
      if (stats.positiveRatio === null || stats.positiveRatio > threshold) {
        return [];
      }
      return [
        draft(rule, {
          title: rule.description,
          description: `研究池内仅 ${formatPercent(stats.positiveRatio)} 的 ETF 当日上涨，下跌 ${stats.downCount}/${stats.validCount}。`,
          evidence: {
            positiveRatio1d: stats.positiveRatio,
            downCount: stats.downCount,
            validCount: stats.validCount,
          },
          thresholds: { positiveRatio1dMax: threshold },
        }),
      ];
    },
  },
  {
    code: "market_dispersion_high",
    level: "market",
    evaluate: (context, rule) => {
      const threshold = requiredParam(rule, "p90P10SpreadMin");
      const stats = context.market.returns.returns["20d"];
      if (stats.p90 === null || stats.p10 === null) {
        return [];
      }
      const spread = stats.p90 - stats.p10;
      if (spread < threshold) {
        return [];
      }
      return [
        draft(rule, {
          title: rule.description,
          description: `20日收益 P90-P10 差值 ${formatPercent(spread)}，达到 ${formatPercent(threshold)} 阈值。`,
          evidence: { p90Return20d: stats.p90, p10Return20d: stats.p10, spread },
          thresholds: { p90P10SpreadMin: threshold },
        }),
      ];
    },
  },
  {
    code: "market_volatility_rising",
    level: "market",
    evaluate: (context, rule) => {
      const threshold = requiredParam(rule, "meanVolatility20dMin");
      const stats = context.market.risk.risk;
      if (stats.meanVolatility20d === null || stats.meanVolatility20d < threshold) {
        return [];
      }
      return [
        draft(rule, {
          title: rule.description,
          description: `研究池平均20日波动率 ${formatPercent(stats.meanVolatility20d)}，达到 ${formatPercent(threshold)} 阈值。`,
          evidence: {
            meanVolatility20d: stats.meanVolatility20d,
            validCount: stats.volatilityValidCount,
          },
          thresholds: { meanVolatility20dMin: threshold },
        }),
      ];
    },
  },
  {
    code: "market_activity_improving",
    level: "market",
    evaluate: (context, rule) => {
      const ratioThreshold = requiredParam(rule, "meanAmountRatio20dMin");
      const breadthThreshold = requiredParam(rule, "positiveRatio1dMin");
      const activity = context.market.activity.activity;
      const returns = context.market.returns.returns["1d"];
      if (
        activity.meanAmountRatio20d === null ||
        returns.positiveRatio === null ||
        activity.meanAmountRatio20d < ratioThreshold ||
        returns.positiveRatio < breadthThreshold
      ) {
        return [];
      }
      return [
        draft(rule, {
          title: rule.description,
          description: `研究池平均成交额较20日均值放大 ${formatPercent(activity.meanAmountRatio20d)}，上涨比例 ${formatPercent(returns.positiveRatio)}。`,
          evidence: {
            meanAmountRatio20d: activity.meanAmountRatio20d,
            positiveRatio1d: returns.positiveRatio,
          },
          thresholds: {
            meanAmountRatio20dMin: ratioThreshold,
            positiveRatio1dMin: breadthThreshold,
          },
        }),
      ];
    },
  },
  {
    code: "market_trend_improving",
    level: "market",
    evaluate: (context, rule) => {
      const aboveThreshold = requiredParam(rule, "aboveMa20RatioMin");
      const bullishThreshold = requiredParam(rule, "bullishRatioMin");
      const stats = context.market.trend.trend;
      if (
        stats.aboveMa20Ratio === null ||
        stats.bullishRatio === null ||
        stats.aboveMa20Ratio < aboveThreshold ||
        stats.bullishRatio < bullishThreshold
      ) {
        return [];
      }
      return [
        draft(rule, {
          title: rule.description,
          description: `${formatPercent(stats.aboveMa20Ratio)} 的 ETF 高于 MA20，${formatPercent(stats.bullishRatio)} 为多头排列。`,
          evidence: {
            aboveMa20Ratio: stats.aboveMa20Ratio,
            bullishRatio: stats.bullishRatio,
          },
          thresholds: {
            aboveMa20RatioMin: aboveThreshold,
            bullishRatioMin: bullishThreshold,
          },
        }),
      ];
    },
  },
  {
    code: "market_risk_concentration",
    level: "market",
    evaluate: (context, rule) => {
      const threshold = requiredParam(rule, "highRiskRatioMin");
      const stats = context.market.risk.risk;
      if (stats.highRiskRatio === null || stats.highRiskRatio < threshold) {
        return [];
      }
      return [
        draft(rule, {
          title: rule.description,
          description: `高风险 ETF 占比 ${formatPercent(stats.highRiskRatio)}（${stats.highRiskCount}/${stats.riskScoreValidCount}）。`,
          evidence: {
            highRiskRatio: stats.highRiskRatio,
            highRiskCount: stats.highRiskCount,
            validCount: stats.riskScoreValidCount,
          },
          thresholds: { highRiskRatioMin: threshold },
        }),
      ];
    },
  },
  {
    code: "market_drawdown_pressure",
    level: "market",
    evaluate: (context, rule) => {
      const meanThreshold = requiredParam(rule, "meanMaxDrawdown60dMax");
      const ratioThreshold = requiredParam(rule, "highDrawdownRatioMin");
      const stats = context.market.risk.risk;
      const meanTriggered =
        stats.meanMaxDrawdown60d !== null && stats.meanMaxDrawdown60d <= meanThreshold;
      const ratioTriggered =
        stats.highDrawdownRatio !== null && stats.highDrawdownRatio >= ratioThreshold;
      if (!meanTriggered && !ratioTriggered) {
        return [];
      }
      const descriptions: string[] = [];
      if (meanTriggered) {
        descriptions.push(`平均60日最大回撤 ${formatPercent(stats.meanMaxDrawdown60d ?? 0)}`);
      }
      if (ratioTriggered) {
        descriptions.push(`高回撤 ETF 占比 ${formatPercent(stats.highDrawdownRatio ?? 0)}`);
      }
      return [
        draft(rule, {
          title: rule.description,
          description: `${descriptions.join("，")}。`,
          evidence: {
            meanMaxDrawdown60d: stats.meanMaxDrawdown60d,
            highDrawdownRatio: stats.highDrawdownRatio,
            highDrawdownCount: stats.highDrawdownCount,
          },
          thresholds: {
            meanMaxDrawdown60dMax: meanThreshold,
            highDrawdownRatioMin: ratioThreshold,
          },
        }),
      ];
    },
  },
  {
    code: "market_valuation_low",
    level: "market",
    evaluate: (context, rule) => valuationRule(context, rule, "maxMedianPercentile", "low"),
  },
  {
    code: "market_valuation_high",
    level: "market",
    evaluate: (context, rule) => valuationRule(context, rule, "minMedianPercentile", "high"),
  },
];

function valuationRule(
  context: RuleContext,
  rule: RuleDefinitionConfig,
  percentileParam: "maxMedianPercentile" | "minMedianPercentile",
  direction: "low" | "high",
): FindingDraft[] {
  const percentileThreshold = requiredParam(rule, percentileParam);
  const validCountThreshold = requiredParam(rule, "minValidCount");
  const stats = context.market.valuation.valuation.pe;
  if (
    stats.medianPercentile === null ||
    stats.validCount < validCountThreshold ||
    (direction === "low"
      ? stats.medianPercentile > percentileThreshold
      : stats.medianPercentile < percentileThreshold)
  ) {
    return [];
  }
  return [
    draft(rule, {
      title: rule.description,
      description: `PE 中位历史百分位 ${formatPercent(stats.medianPercentile)}，有效指数 ${stats.validCount} 个。`,
      evidence: {
        peMedianPercentile: stats.medianPercentile,
        peValidCount: stats.validCount,
      },
      thresholds: {
        [percentileParam]: percentileThreshold,
        minValidCount: validCountThreshold,
      },
    }),
  ];
}

function draft(
  rule: RuleDefinitionConfig,
  content: Omit<FindingDraft, "ruleCode" | "level" | "etfCode">,
): FindingDraft {
  return {
    ruleCode: rule.code,
    level: "market",
    ...content,
  };
}
