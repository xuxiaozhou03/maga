import type { CalculationConfig } from "../config/schemas.js";
import { marketStateSchema, type MarketState, type MarketStateCode } from "../domain/market.js";
import type { ActivityStats, ReturnStats, RiskStats, TrendStats } from "../domain/market.js";
import { roundTo } from "../calculations/math.js";

export interface CalculateMarketStateInput {
  analysisDate: string;
  return1d: ReturnStats;
  return20d: ReturnStats;
  trend: TrendStats;
  risk: RiskStats;
  activity: ActivityStats;
  config: CalculationConfig;
}

const STATE_LABELS: Record<MarketStateCode, string> = {
  risk_rising: "风险上升",
  weak: "整体偏弱",
  strong: "整体偏强",
  diverging: "震荡分化",
  activity_improving: "成交活跃度改善",
  neutral: "中性震荡",
};

export function calculateMarketState(input: CalculateMarketStateInput): MarketState {
  const thresholds = input.config.marketState;
  const evidence = {
    positiveRatio1d: rounded(input.return1d.positiveRatio),
    medianReturn20d: rounded(input.return20d.median),
    aboveMa20Ratio: rounded(input.trend.aboveMa20Ratio),
    meanVolatility20d: rounded(input.risk.meanVolatility20d),
    p90Return20d: rounded(input.return20d.p90),
    p10Return20d: rounded(input.return20d.p10),
    meanAmountRatio20d: rounded(input.activity.meanAmountRatio20d),
  };

  let code: MarketStateCode = "neutral";
  if (
    atLeast(evidence.meanVolatility20d, thresholds.highVolatility20d) &&
    atMost(evidence.positiveRatio1d, thresholds.riskRisingPositiveRatioMax)
  ) {
    code = "risk_rising";
  } else if (
    atMost(evidence.positiveRatio1d, thresholds.weakPositiveRatio) ||
    (atMost(evidence.medianReturn20d, thresholds.weakMedianReturn20d) &&
      atMost(evidence.aboveMa20Ratio, thresholds.weakAboveMa20Ratio))
  ) {
    code = "weak";
  } else if (
    atLeast(evidence.positiveRatio1d, thresholds.strongPositiveRatio) &&
    atLeast(evidence.medianReturn20d, thresholds.strongMedianReturn20d) &&
    atLeast(evidence.aboveMa20Ratio, thresholds.strongAboveMa20Ratio)
  ) {
    code = "strong";
  } else if (
    evidence.p90Return20d !== null &&
    evidence.p10Return20d !== null &&
    evidence.p90Return20d - evidence.p10Return20d >= thresholds.highDispersion20d &&
    between(
      evidence.positiveRatio1d,
      thresholds.dispersionPositiveRatioMin,
      thresholds.dispersionPositiveRatioMax,
    )
  ) {
    code = "diverging";
  } else if (
    atLeast(evidence.meanAmountRatio20d, thresholds.activityImprovement) &&
    atLeast(evidence.positiveRatio1d, thresholds.activityPositiveRatioMin)
  ) {
    code = "activity_improving";
  }

  return marketStateSchema.parse({
    schemaVersion: 1,
    analysisDate: input.analysisDate,
    code,
    label: STATE_LABELS[code],
    matchedRule: code,
    evidence,
    thresholds,
  });
}

function atLeast(value: number | null, threshold: number): boolean {
  return value !== null && value >= threshold;
}

function atMost(value: number | null, threshold: number): boolean {
  return value !== null && value <= threshold;
}

function between(value: number | null, minimum: number, maximum: number): boolean {
  return value !== null && value >= minimum && value <= maximum;
}

function rounded(value: number | null): number | null {
  return value === null ? null : roundTo(value);
}
