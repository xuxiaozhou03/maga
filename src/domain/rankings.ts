import { z } from "zod";
import { dateStringSchema } from "./date.js";

const finiteNumberSchema = z.number().refine(Number.isFinite, "Expected a finite number");

export const RANKING_CODES = [
  "return_1d",
  "return_5d",
  "return_20d",
  "return_60d",
  "return_120d",
  "return_250d",
  "return_ytd",
  "trend_score",
  "risk_score",
  "activity_amount_20d",
  "valuation_pe",
  "valuation_pb",
  "valuation_ps",
] as const;

export const rankingCodeSchema = z.enum(RANKING_CODES);
export type RankingCode = z.infer<typeof rankingCodeSchema>;

export const rankingDirectionSchema = z.enum(["asc", "desc"]);
export type RankingDirection = z.infer<typeof rankingDirectionSchema>;

export const rankingInterpretationSchema = z.enum([
  "higher_is_better",
  "lower_is_better",
  "neutral",
]);
export type RankingInterpretation = z.infer<typeof rankingInterpretationSchema>;

export const rankingItemSchema = z.object({
  rank: z.number().int().positive(),
  code: z.string().min(1),
  value: finiteNumberSchema,
  percentile: z.number().min(0).max(1),
  sampleValid: z.literal(true),
});

export type RankingItem = z.infer<typeof rankingItemSchema>;

export const rankingFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    rankingCode: rankingCodeSchema,
    analysisDate: dateStringSchema,
    snapshotVersion: z.number().int().positive(),
    direction: rankingDirectionSchema,
    interpretation: rankingInterpretationSchema,
    totalCount: z.number().int().nonnegative(),
    eligibleCount: z.number().int().nonnegative(),
    insufficientSample: z.boolean(),
    minSample: z.number().int().positive(),
    items: z.array(rankingItemSchema),
  })
  .superRefine((file, context) => {
    if (file.eligibleCount !== file.items.length && !file.insufficientSample) {
      context.addIssue({
        code: "custom",
        path: ["eligibleCount"],
        message: "eligibleCount must equal items length for a sufficient ranking",
      });
    }
    if (file.insufficientSample && file.items.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "An insufficient ranking must have no items",
      });
    }

    const codes = new Set<string>();
    for (const [index, item] of file.items.entries()) {
      if (codes.has(item.code)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "code"],
          message: `Duplicate ranking code: ${item.code}`,
        });
      }
      codes.add(item.code);
    }
  });

export type RankingFile = z.infer<typeof rankingFileSchema>;

export const filteredRankingItemSchema = z.object({
  filteredRank: z.number().int().positive(),
  code: z.string().min(1),
  value: finiteNumberSchema,
  percentile: z.number().min(0).max(1),
  fullPoolRank: z.number().int().positive().nullable(),
});

export type FilteredRankingItem = z.infer<typeof filteredRankingItemSchema>;

export const filteredRankingSchema = z.object({
  schemaVersion: z.literal(1),
  scope: z.literal("filtered"),
  analysisDate: dateStringSchema,
  rankingCode: rankingCodeSchema,
  filter: z.object({
    primaryCode: z.string().min(1).nullable(),
    secondaryCode: z.string().min(1).nullable(),
    status: z.enum(["pending", "confirmed"]).nullable().optional(),
  }),
  fullPool: z.object({
    rankingCode: rankingCodeSchema,
    eligibleCount: z.number().int().nonnegative(),
    insufficientSample: z.boolean(),
  }),
  filtered: z.object({
    eligibleCount: z.number().int().nonnegative(),
    insufficientSample: z.boolean(),
    items: z.array(filteredRankingItemSchema),
  }),
});

export type FilteredRanking = z.infer<typeof filteredRankingSchema>;
