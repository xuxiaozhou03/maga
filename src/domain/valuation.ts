import { z } from "zod";
import { dateStringSchema } from "./date.js";

export const valuationTypeSchema = z.enum(["PE", "PB", "PS"]);
export type ValuationType = z.infer<typeof valuationTypeSchema>;

export const VALUATION_TYPES = ["PE", "PB", "PS"] as const;

const finiteNumberSchema = z.number().refine(Number.isFinite, "Expected a finite number");

export const indexValuationItemSchema = z
  .object({
    date: dateStringSchema,
    type: valuationTypeSchema,
    value: finiteNumberSchema,
    historicalPercentile: z.number().min(0).max(1).nullable(),
    peg: finiteNumberSchema.nullable(),
    pegUsable: z.boolean(),
    source: z.literal("hongsehuojian"),
    collectedAt: z.string().min(1),
  })
  .superRefine((item, context) => {
    const pegUsable = item.peg !== null && item.peg > 0;
    if (item.pegUsable !== pegUsable) {
      context.addIssue({
        code: "custom",
        path: ["pegUsable"],
        message: "pegUsable must be true exactly when peg is a positive number",
      });
    }
    if (item.type !== "PE" && (item.peg !== null || item.pegUsable)) {
      context.addIssue({
        code: "custom",
        path: ["peg"],
        message: "PEG can only be stored for PE valuations",
      });
    }
  });

export type IndexValuationItem = z.infer<typeof indexValuationItemSchema>;

export const valuationCoverageEntrySchema = z
  .object({
    supported: z.boolean(),
    lastDate: dateStringSchema.nullable(),
    count: z.number().int().nonnegative(),
  })
  .superRefine((entry, context) => {
    if ((entry.count === 0) !== (entry.lastDate === null)) {
      context.addIssue({
        code: "custom",
        path: ["count"],
        message: "count and lastDate must both be empty or both be populated",
      });
    }
  });

export type ValuationCoverageEntry = z.infer<typeof valuationCoverageEntrySchema>;

export const valuationCoverageSchema = z.object({
  PE: valuationCoverageEntrySchema,
  PB: valuationCoverageEntrySchema,
  PS: valuationCoverageEntrySchema,
});

export type ValuationCoverage = z.infer<typeof valuationCoverageSchema>;

export const indexCodeSchema = z
  .string()
  .regex(/^[A-Za-z0-9]+\.[A-Za-z0-9]+$/, "Invalid index code");

export const indexValuationFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    code: indexCodeSchema,
    updatedAt: z.string().min(1),
    coverage: valuationCoverageSchema,
    items: z.array(indexValuationItemSchema),
  })
  .superRefine((file, context) => {
    const keys = new Set<string>();
    const typeStats = new Map<ValuationType, { count: number; lastDate: string | null }>();

    for (const [index, item] of file.items.entries()) {
      const key = `${item.date}:${item.type}`;
      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["items", index],
          message: `Duplicate valuation key: ${key}`,
        });
      }
      keys.add(key);

      const stats = typeStats.get(item.type) ?? { count: 0, lastDate: null };
      stats.count += 1;
      stats.lastDate =
        stats.lastDate === null || item.date > stats.lastDate ? item.date : stats.lastDate;
      typeStats.set(item.type, stats);
    }

    for (const type of VALUATION_TYPES) {
      const stats = typeStats.get(type) ?? { count: 0, lastDate: null };
      const coverage = file.coverage[type];
      if (coverage.count !== stats.count || coverage.lastDate !== stats.lastDate) {
        context.addIssue({
          code: "custom",
          path: ["coverage", type],
          message: `Coverage does not match ${type} items`,
        });
      }
    }
  });

export type IndexValuationFile = z.infer<typeof indexValuationFileSchema>;
