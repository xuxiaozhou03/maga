import { z } from "zod";
import { dateStringSchema } from "./date.js";

const finiteNumberSchema = z.number().refine(Number.isFinite, "Expected a finite number");
const nullableFiniteNumberSchema = finiteNumberSchema.nullable();
const nullableNonNegativeIntegerSchema = z.number().int().nonnegative().nullable();

export const distributionBinSchema = z.object({
  lower: finiteNumberSchema,
  upper: finiteNumberSchema,
  count: z.number().int().nonnegative(),
});

export type DistributionBin = z.infer<typeof distributionBinSchema>;

export const marketSampleSummarySchema = z.object({
  poolCount: z.number().int().nonnegative(),
  klineValidCount: z.number().int().nonnegative(),
  uniqueIndexCount: z.number().int().nonnegative(),
  valuationValidIndexCount: z.number().int().nonnegative(),
  valuationValidEtfCount: z.number().int().nonnegative(),
  staleEtfCodes: z.array(z.string().min(1)),
  valuationUnsupportedIndexes: z.array(z.string().min(1)),
});

export type MarketSampleSummary = z.infer<typeof marketSampleSummarySchema>;

export const returnStatsSchema = z.object({
  validCount: z.number().int().nonnegative(),
  mean: nullableFiniteNumberSchema,
  median: nullableFiniteNumberSchema,
  upCount: z.number().int().nonnegative(),
  downCount: z.number().int().nonnegative(),
  flatCount: z.number().int().nonnegative(),
  positiveRatio: nullableFiniteNumberSchema,
  negativeRatio: nullableFiniteNumberSchema,
  p10: nullableFiniteNumberSchema,
  p25: nullableFiniteNumberSchema,
  p75: nullableFiniteNumberSchema,
  p90: nullableFiniteNumberSchema,
  distribution: z.array(distributionBinSchema),
});

export type ReturnStats = z.infer<typeof returnStatsSchema>;

export const MARKET_RETURN_PERIODS = ["1d", "5d", "20d", "60d", "120d", "250d", "ytd"] as const;
export type MarketReturnPeriod = (typeof MARKET_RETURN_PERIODS)[number];

export const marketReturnsSchema = z.object({
  schemaVersion: z.literal(1),
  analysisDate: dateStringSchema,
  returns: z.object({
    "1d": returnStatsSchema,
    "5d": returnStatsSchema,
    "20d": returnStatsSchema,
    "60d": returnStatsSchema,
    "120d": returnStatsSchema,
    "250d": returnStatsSchema,
    ytd: returnStatsSchema,
  }),
});

export type MarketReturns = z.infer<typeof marketReturnsSchema>;

export const trendStatsSchema = z.object({
  validCount: z.number().int().nonnegative(),
  bullishCount: z.number().int().nonnegative(),
  bearishCount: z.number().int().nonnegative(),
  neutralCount: z.number().int().nonnegative(),
  bullishRatio: nullableFiniteNumberSchema,
  bearishRatio: nullableFiniteNumberSchema,
  neutralRatio: nullableFiniteNumberSchema,
  aboveMa20ValidCount: z.number().int().nonnegative(),
  aboveMa20Count: z.number().int().nonnegative(),
  aboveMa20Ratio: nullableFiniteNumberSchema,
  aboveMa60ValidCount: z.number().int().nonnegative(),
  aboveMa60Count: z.number().int().nonnegative(),
  aboveMa60Ratio: nullableFiniteNumberSchema,
  aboveMa120ValidCount: z.number().int().nonnegative(),
  aboveMa120Count: z.number().int().nonnegative(),
  aboveMa120Ratio: nullableFiniteNumberSchema,
});

export type TrendStats = z.infer<typeof trendStatsSchema>;

export const marketTrendSchema = z.object({
  schemaVersion: z.literal(1),
  analysisDate: dateStringSchema,
  trend: trendStatsSchema,
});

export type MarketTrend = z.infer<typeof marketTrendSchema>;

export const riskStatsSchema = z.object({
  volatilityValidCount: z.number().int().nonnegative(),
  meanVolatility20d: nullableFiniteNumberSchema,
  medianVolatility20d: nullableFiniteNumberSchema,
  highVolatilityCount: z.number().int().nonnegative(),
  highVolatilityRatio: nullableFiniteNumberSchema,
  drawdownValidCount: z.number().int().nonnegative(),
  meanMaxDrawdown60d: nullableFiniteNumberSchema,
  highDrawdownCount: z.number().int().nonnegative(),
  highDrawdownRatio: nullableFiniteNumberSchema,
  riskScoreValidCount: z.number().int().nonnegative(),
  meanRiskScore: nullableFiniteNumberSchema,
  highRiskCount: z.number().int().nonnegative(),
  highRiskRatio: nullableFiniteNumberSchema,
  volatilityDistribution: z.array(distributionBinSchema),
  drawdownDistribution: z.array(distributionBinSchema),
});

export type RiskStats = z.infer<typeof riskStatsSchema>;

export const marketRiskSchema = z.object({
  schemaVersion: z.literal(1),
  analysisDate: dateStringSchema,
  risk: riskStatsSchema,
});

export type MarketRisk = z.infer<typeof marketRiskSchema>;

export const activityStatsSchema = z.object({
  amountValidCount: z.number().int().nonnegative(),
  totalAmount: nullableFiniteNumberSchema,
  meanAmount: nullableFiniteNumberSchema,
  medianAmount: nullableFiniteNumberSchema,
  ratioValidCount: z.number().int().nonnegative(),
  meanAmountRatio20d: nullableFiniteNumberSchema,
  expandedCount: z.number().int().nonnegative(),
  expandedRatio: nullableFiniteNumberSchema,
  amountDistribution: z.array(distributionBinSchema),
});

export type ActivityStats = z.infer<typeof activityStatsSchema>;

export const marketActivitySchema = z.object({
  schemaVersion: z.literal(1),
  analysisDate: dateStringSchema,
  activity: activityStatsSchema,
});

export type MarketActivity = z.infer<typeof marketActivitySchema>;

export const valuationTypeStatsSchema = z.object({
  validCount: z.number().int().nonnegative(),
  validEtfCount: z.number().int().nonnegative(),
  coverageRatio: nullableFiniteNumberSchema,
  etfCoverageRatio: nullableFiniteNumberSchema,
  medianPercentile: nullableFiniteNumberSchema,
  lowCount: nullableNonNegativeIntegerSchema,
  highCount: nullableNonNegativeIntegerSchema,
  staleCount: nullableNonNegativeIntegerSchema,
  tooStaleCount: nullableNonNegativeIntegerSchema,
  insufficientSample: z.boolean(),
  distribution: z.array(distributionBinSchema),
});

export type ValuationTypeStats = z.infer<typeof valuationTypeStatsSchema>;

export const marketValuationSchema = z.object({
  schemaVersion: z.literal(1),
  analysisDate: dateStringSchema,
  valuation: z.object({
    pe: valuationTypeStatsSchema,
    pb: valuationTypeStatsSchema,
    ps: valuationTypeStatsSchema,
  }),
});

export type MarketValuation = z.infer<typeof marketValuationSchema>;

export const MARKET_STATE_CODES = [
  "risk_rising",
  "weak",
  "strong",
  "diverging",
  "activity_improving",
  "neutral",
] as const;

export const marketStateCodeSchema = z.enum(MARKET_STATE_CODES);
export type MarketStateCode = z.infer<typeof marketStateCodeSchema>;

export const marketStateEvidenceSchema = z.object({
  positiveRatio1d: nullableFiniteNumberSchema,
  medianReturn20d: nullableFiniteNumberSchema,
  aboveMa20Ratio: nullableFiniteNumberSchema,
  meanVolatility20d: nullableFiniteNumberSchema,
  p90Return20d: nullableFiniteNumberSchema,
  p10Return20d: nullableFiniteNumberSchema,
  meanAmountRatio20d: nullableFiniteNumberSchema,
});

export const marketStateThresholdsSchema = z.object({
  strongPositiveRatio: finiteNumberSchema,
  weakPositiveRatio: finiteNumberSchema,
  strongMedianReturn20d: finiteNumberSchema,
  weakMedianReturn20d: finiteNumberSchema,
  strongAboveMa20Ratio: finiteNumberSchema,
  weakAboveMa20Ratio: finiteNumberSchema,
  highVolatility20d: finiteNumberSchema,
  riskRisingPositiveRatioMax: finiteNumberSchema,
  highDrawdown60d: finiteNumberSchema,
  highRiskScore: finiteNumberSchema,
  highDispersion20d: finiteNumberSchema,
  dispersionPositiveRatioMin: finiteNumberSchema,
  dispersionPositiveRatioMax: finiteNumberSchema,
  activityImprovement: finiteNumberSchema,
  activityPositiveRatioMin: finiteNumberSchema,
  riskConcentrationRatio: finiteNumberSchema,
});

export const marketStateSchema = z.object({
  schemaVersion: z.literal(1),
  analysisDate: dateStringSchema,
  code: marketStateCodeSchema,
  label: z.string().min(1),
  matchedRule: marketStateCodeSchema,
  evidence: marketStateEvidenceSchema,
  thresholds: marketStateThresholdsSchema,
});

export type MarketState = z.infer<typeof marketStateSchema>;
