import { z } from "zod";
import { dateStringSchema } from "./date.js";
import { warningItemSchema } from "./warnings.js";

const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const finiteNumberSchema = z.number().refine(Number.isFinite, "Expected a finite number");
const nullableFiniteNumberSchema = finiteNumberSchema.nullable();

export const snapshotStatusSchema = z.enum(["building", "validated", "published", "failed"]);
export type SnapshotStatus = z.infer<typeof snapshotStatusSchema>;

export const snapshotDataStatusSchema = z.enum(["complete", "partial"]);
export type SnapshotDataStatus = z.infer<typeof snapshotDataStatusSchema>;

export const snapshotReasonSchema = z.enum([
  "first_run",
  "daily",
  "recompute",
  "force",
  "valuation_recompute",
]);
export type SnapshotReason = z.infer<typeof snapshotReasonSchema>;

export const snapshotFileEntrySchema = z.object({
  path: z
    .string()
    .min(1)
    .refine(
      (path) => !path.startsWith("/") && !path.includes("..") && path !== "manifest.json",
      "Snapshot file path must be relative and must not be the manifest",
    ),
  checksum: checksumSchema,
  bytes: z.number().int().nonnegative(),
});

export type SnapshotFileEntry = z.infer<typeof snapshotFileEntrySchema>;

export const sourceAsOfSchema = z.object({
  etfListFetchedAt: z.string().min(1).nullable(),
  klineLastDate: dateStringSchema.nullable(),
  valuationLastDate: dateStringSchema.nullable(),
});

export type SourceAsOf = z.infer<typeof sourceAsOfSchema>;

export const snapshotManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisDate: dateStringSchema,
    snapshotVersion: z.number().int().positive(),
    status: snapshotStatusSchema,
    dataStatus: snapshotDataStatusSchema,
    createdAt: z.string().min(1),
    publishedAt: z.string().min(1).nullable(),
    algorithmVersion: z.string().min(1),
    configVersion: z.number().int().positive(),
    configHash: checksumSchema,
    ruleVersion: z.string().min(1),
    ruleConfigHash: checksumSchema,
    categoryMappingVersion: z.number().int().positive(),
    categoryMappingHash: checksumSchema,
    poolVersion: z.number().int().positive(),
    poolHash: checksumSchema,
    etfCount: z.number().int().nonnegative(),
    klineValidCount: z.number().int().nonnegative(),
    valuationValidIndexCount: z.number().int().nonnegative(),
    valuationValidEtfCount: z.number().int().nonnegative(),
    sourceAsOf: sourceAsOfSchema,
    inputFingerprint: checksumSchema,
    parentVersion: z.number().int().positive().nullable(),
    reason: snapshotReasonSchema,
    counts: z.object({
      etfs: z.number().int().nonnegative(),
      rankings: z.number().int().nonnegative(),
      market: z.number().int().nonnegative(),
      findings: z.number().int().nonnegative(),
    }),
    files: z.array(snapshotFileEntrySchema),
    warnings: z.array(warningItemSchema),
  })
  .superRefine((manifest, context) => {
    if (manifest.status === "published" && manifest.publishedAt === null) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "Published snapshots require publishedAt",
      });
    }
    if (manifest.status !== "published" && manifest.publishedAt !== null) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "Only published snapshots may have publishedAt",
      });
    }
    if (manifest.parentVersion !== null && manifest.parentVersion >= manifest.snapshotVersion) {
      context.addIssue({
        code: "custom",
        path: ["parentVersion"],
        message: "parentVersion must be lower than snapshotVersion",
      });
    }

    const paths = new Set<string>();
    for (const [index, file] of manifest.files.entries()) {
      if (paths.has(file.path)) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: `Duplicate manifest file: ${file.path}`,
        });
      }
      paths.add(file.path);
    }
  });

export type SnapshotManifest = z.infer<typeof snapshotManifestSchema>;

export const snapshotVersionEntrySchema = z.object({
  version: z.number().int().positive(),
  status: z.literal("published"),
  publishedAt: z.string().min(1),
});

export const snapshotIndexSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().min(1),
  dates: z.array(
    z.object({
      analysisDate: dateStringSchema,
      latestVersion: z.number().int().positive(),
      versions: z.array(snapshotVersionEntrySchema),
    }),
  ),
});

export type SnapshotIndex = z.infer<typeof snapshotIndexSchema>;

export const currentPointerSchema = z.object({
  schemaVersion: z.literal(1),
  analysisDate: dateStringSchema,
  snapshotVersion: z.number().int().positive(),
  snapshotPath: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type CurrentPointer = z.infer<typeof currentPointerSchema>;

export const inputDigestSchema = z.object({
  analysisDate: dateStringSchema,
  algorithmVersion: z.string().min(1),
  configHash: checksumSchema,
  ruleConfigHash: checksumSchema,
  categoryMappingHash: checksumSchema,
  poolHash: checksumSchema,
  etfs: z.array(
    z.object({
      code: z.string().min(1),
      firstDate: dateStringSchema.nullable(),
      lastDate: dateStringSchema.nullable(),
      rowCount: z.number().int().nonnegative(),
      rowsHash: checksumSchema,
    }),
  ),
  valuations: z.array(
    z.object({
      code: z.string().min(1),
      type: z.enum(["PE", "PB", "PS"]),
      lastDate: dateStringSchema,
      count: z.number().int().positive(),
      rowsHash: checksumSchema,
    }),
  ),
});

export type InputDigest = z.infer<typeof inputDigestSchema>;

export const marketOverviewSchema = z.object({
  schemaVersion: z.literal(1),
  analysisDate: dateStringSchema,
  state: z.object({
    code: z.string().min(1),
    label: z.string().min(1),
    matchedRule: z.string().min(1),
  }),
  returns: z.object({
    "1d": z.object({
      median: nullableFiniteNumberSchema,
      positiveRatio: nullableFiniteNumberSchema,
      validCount: z.number().int().nonnegative(),
    }),
    "20d": z.object({
      median: nullableFiniteNumberSchema,
      positiveRatio: nullableFiniteNumberSchema,
      validCount: z.number().int().nonnegative(),
    }),
  }),
  trend: z.object({
    bullishRatio: nullableFiniteNumberSchema,
    aboveMa20Ratio: nullableFiniteNumberSchema,
    validCount: z.number().int().nonnegative(),
  }),
  risk: z.object({
    meanVolatility20d: nullableFiniteNumberSchema,
    highDrawdownRatio: nullableFiniteNumberSchema,
    meanRiskScore: nullableFiniteNumberSchema,
    validCount: z.number().int().nonnegative(),
  }),
  activity: z.object({
    meanAmountRatio20d: nullableFiniteNumberSchema,
    expandedRatio: nullableFiniteNumberSchema,
    validCount: z.number().int().nonnegative(),
  }),
  valuation: z.object({
    peMedianPercentile: nullableFiniteNumberSchema,
    pbMedianPercentile: nullableFiniteNumberSchema,
    psMedianPercentile: nullableFiniteNumberSchema,
    valuationValidIndexCount: z.number().int().nonnegative(),
    valuationValidEtfCount: z.number().int().nonnegative(),
  }),
  findings: z.object({
    marketCount: z.number().int().nonnegative(),
    etfCount: z.number().int().nonnegative(),
  }),
});

export type MarketOverview = z.infer<typeof marketOverviewSchema>;
