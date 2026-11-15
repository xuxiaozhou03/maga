import { z } from "zod";
import { dateStringSchema } from "./date.js";

const finiteNumberSchema = z.number().refine(Number.isFinite, "Expected a finite number");
const nullableFiniteNumberSchema = finiteNumberSchema.nullable();
const nullableDateSchema = dateStringSchema.nullable();
const nullableBooleanSchema = z.boolean().nullable();

export const categoryAssignmentSchema = z
  .object({
    primaryCode: z.string().min(1).nullable(),
    secondaryCode: z.string().min(1).nullable(),
    status: z.enum(["pending", "confirmed"]),
    mappingVersion: z.number().int().positive(),
  })
  .superRefine((category, context) => {
    if (category.status === "confirmed" && (!category.primaryCode || !category.secondaryCode)) {
      context.addIssue({
        code: "custom",
        message: "Confirmed category requires both primaryCode and secondaryCode",
      });
    }
  });

export type CategoryAssignment = z.infer<typeof categoryAssignmentSchema>;

export const returnsFeaturesSchema = z.object({
  "1d": nullableFiniteNumberSchema,
  "5d": nullableFiniteNumberSchema,
  "20d": nullableFiniteNumberSchema,
  "60d": nullableFiniteNumberSchema,
  "120d": nullableFiniteNumberSchema,
  "250d": nullableFiniteNumberSchema,
  ytd: nullableFiniteNumberSchema,
});

export type ReturnsFeatures = z.infer<typeof returnsFeaturesSchema>;

export const bollingerFeaturesSchema = z.object({
  middle: nullableFiniteNumberSchema,
  upper: nullableFiniteNumberSchema,
  lower: nullableFiniteNumberSchema,
  percentB: nullableFiniteNumberSchema,
  bandwidth: nullableFiniteNumberSchema,
});

export const trendFeaturesSchema = z.object({
  close: nullableFiniteNumberSchema,
  ma5: nullableFiniteNumberSchema,
  ma10: nullableFiniteNumberSchema,
  ma20: nullableFiniteNumberSchema,
  ma60: nullableFiniteNumberSchema,
  ma120: nullableFiniteNumberSchema,
  ma20Deviation: nullableFiniteNumberSchema,
  ma60Deviation: nullableFiniteNumberSchema,
  aboveMa20: nullableBooleanSchema,
  aboveMa60: nullableBooleanSchema,
  aboveMa120: nullableBooleanSchema,
  maAlignment: z.enum(["bullish", "bearish", "neutral"]).nullable(),
  maAlignmentScore: z.number().int().min(0).max(6).nullable(),
  boll20: bollingerFeaturesSchema,
});

export type TrendFeatures = z.infer<typeof trendFeaturesSchema>;

export const riskFeaturesSchema = z.object({
  volatility20d: nullableFiniteNumberSchema,
  volatility60d: nullableFiniteNumberSchema,
  volatility120d: nullableFiniteNumberSchema,
  maxDrawdown20d: nullableFiniteNumberSchema,
  maxDrawdown60d: nullableFiniteNumberSchema,
  maxDrawdown120d: nullableFiniteNumberSchema,
  maxDrawdown250d: nullableFiniteNumberSchema,
  currentDrawdown: nullableFiniteNumberSchema,
  sampleHigh: nullableFiniteNumberSchema,
  distanceFromSampleHigh: nullableFiniteNumberSchema,
  maxDrawdown60dPeakDate: nullableDateSchema,
  maxDrawdown60dTroughDate: nullableDateSchema,
});

export type RiskFeatures = z.infer<typeof riskFeaturesSchema>;

export const activityFeaturesSchema = z.object({
  amount: nullableFiniteNumberSchema,
  averageAmount5d: nullableFiniteNumberSchema,
  averageAmount20d: nullableFiniteNumberSchema,
  averageAmount60d: nullableFiniteNumberSchema,
  amountRatio20d: nullableFiniteNumberSchema,
  amountRatio60d: nullableFiniteNumberSchema,
  amountSampleCount20d: z.number().int().nonnegative(),
});

export type ActivityFeatures = z.infer<typeof activityFeaturesSchema>;

export const valuationFeatureSchema = z.object({
  value: finiteNumberSchema,
  historicalPercentile: z.number().min(0).max(1).nullable(),
  date: dateStringSchema,
  lagDays: z.number().int().nonnegative(),
  lagTradingDays: z.number().int().nonnegative(),
  peg: nullableFiniteNumberSchema,
  pegUsable: z.boolean(),
  source: z.literal("hongsehuojian"),
  freshness: z.enum(["fresh", "stale", "too_stale"]),
});

export type ValuationFeature = z.infer<typeof valuationFeatureSchema>;

export const valuationFeaturesSchema = z.object({
  pe: valuationFeatureSchema.nullable(),
  pb: valuationFeatureSchema.nullable(),
  ps: valuationFeatureSchema.nullable(),
});

export type ValuationFeatures = z.infer<typeof valuationFeaturesSchema>;

export const historyStatsSchema = z.object({
  tradingDays: z.number().int().nonnegative(),
  totalReturn: finiteNumberSchema,
  annualizedReturn: nullableFiniteNumberSchema,
  meanDailyReturn: finiteNumberSchema,
  medianDailyReturn: finiteNumberSchema,
  dailyReturnStd: nullableFiniteNumberSchema,
  annualizedVolatility: nullableFiniteNumberSchema,
  maxDrawdown: finiteNumberSchema,
  sharpe: nullableFiniteNumberSchema,
  sortino: nullableFiniteNumberSchema,
  calmar: nullableFiniteNumberSchema,
  maxUpStreak: z.number().int().nonnegative(),
  maxDownStreak: z.number().int().nonnegative(),
  newHighCount: z.number().int().nonnegative(),
  averageAmount: nullableFiniteNumberSchema,
  amountSampleCount: z.number().int().nonnegative(),
});

export type HistoryStats = z.infer<typeof historyStatsSchema>;

export const historyFeaturesSchema = z.object({
  "1m": historyStatsSchema.nullable(),
  "3m": historyStatsSchema.nullable(),
  "6m": historyStatsSchema.nullable(),
  ytd: historyStatsSchema.nullable(),
  "1y": historyStatsSchema.nullable(),
  "2y": historyStatsSchema.nullable(),
});

export type HistoryFeatures = z.infer<typeof historyFeaturesSchema>;

export const etfFeaturesSchema = z.object({
  returns: returnsFeaturesSchema,
  trend: trendFeaturesSchema,
  risk: riskFeaturesSchema,
  activity: activityFeaturesSchema,
  valuation: valuationFeaturesSchema,
  history: historyFeaturesSchema,
});

export type EtfFeatures = z.infer<typeof etfFeaturesSchema>;

export const dataQualitySchema = z.object({
  sampleValid: z.boolean(),
  klineRows: z.number().int().nonnegative(),
  firstKlineDate: nullableDateSchema,
  lastKlineDate: nullableDateSchema,
  amountSampleCount20d: z.number().int().nonnegative(),
  warnings: z.array(z.string().min(1)),
});

export type DataQuality = z.infer<typeof dataQualitySchema>;

export const etfFeatureFileSchema = z.object({
  schemaVersion: z.literal(1),
  code: z.string().min(1),
  name: z.string().min(1),
  exchange: z.enum(["SH", "SZ", "BJ", "OTHER"]),
  analysisDate: dateStringSchema,
  latestKlineDate: nullableDateSchema,
  category: categoryAssignmentSchema,
  dataQuality: dataQualitySchema,
  features: etfFeaturesSchema,
  computedAt: z.string().min(1),
});

export type EtfFeatureFile = z.infer<typeof etfFeatureFileSchema>;
