import { z } from "zod";

const finiteNumberSchema = z.number().refine(Number.isFinite, "Expected a finite number");

export const exchangeSchema = z.enum(["SH", "SZ", "BJ", "OTHER"]);

export const etfSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  exchange: exchangeSchema,
  scale: finiteNumberSchema,
  trackingIndex: z.string().min(1).nullable(),
  trackIndex: z.string().min(1),
  premiumRate: finiteNumberSchema.nullable(),
  amount: finiteNumberSchema.nullable(),
});

export type Etf = z.infer<typeof etfSchema>;
export type Exchange = z.infer<typeof exchangeSchema>;

export const masterEtfFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    poolVersion: z.number().int().positive(),
    poolHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    updatedAt: z.string().min(1),
    sourceFetchedAt: z.string().min(1),
    sourceTotal: z.number().int().nonnegative(),
    items: z.array(etfSchema),
  })
  .superRefine((file, context) => {
    const codes = new Set<string>();
    const trackIndexes = new Set<string>();
    for (const [index, item] of file.items.entries()) {
      if (codes.has(item.code)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "code"],
          message: `Duplicate ETF code: ${item.code}`,
        });
      }
      if (trackIndexes.has(item.trackIndex)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "trackIndex"],
          message: `Duplicate representative trackIndex: ${item.trackIndex}`,
        });
      }
      codes.add(item.code);
      trackIndexes.add(item.trackIndex);
    }
  });

export type MasterEtfFile = z.infer<typeof masterEtfFileSchema>;

export const selectionReasonSchema = z.enum([
  "missing_code",
  "missing_name",
  "missing_track_index",
  "debt_name",
  "scale_missing_or_invalid",
  "scale_below_threshold",
  "amount_invalid",
  "amount_below_threshold",
  "duplicate_track_index",
]);

export type SelectionReason = z.infer<typeof selectionReasonSchema>;

export const rejectedEtfSchema = z.object({
  code: z.string().nullable(),
  reason: selectionReasonSchema,
  trackIndex: z.string().nullable(),
  scale: finiteNumberSchema.nullable(),
});

export type RejectedEtf = z.infer<typeof rejectedEtfSchema>;

export const representativeChangeSchema = z.object({
  trackIndex: z.string().min(1),
  previousCode: z.string().min(1),
  newCode: z.string().min(1),
});

export const selectionReportSchema = z.object({
  fetchedAt: z.string().min(1),
  sourceTotal: z.number().int().nonnegative(),
  poolCount: z.number().int().nonnegative(),
  reasons: z.object({
    missing_code: z.number().int().nonnegative(),
    missing_name: z.number().int().nonnegative(),
    missing_track_index: z.number().int().nonnegative(),
    debt_name: z.number().int().nonnegative(),
    scale_missing_or_invalid: z.number().int().nonnegative(),
    scale_below_threshold: z.number().int().nonnegative(),
    amount_invalid: z.number().int().nonnegative(),
    amount_below_threshold: z.number().int().nonnegative(),
    duplicate_track_index: z.number().int().nonnegative(),
  }),
  afterBasicFilter: z.number().int().nonnegative(),
  duplicateGroups: z.number().int().nonnegative(),
  maxGroupSize: z.number().int().nonnegative(),
  representativeChanges: z.array(representativeChangeSchema),
  rejected: z.array(rejectedEtfSchema),
});

export type SelectionReport = z.infer<typeof selectionReportSchema>;
