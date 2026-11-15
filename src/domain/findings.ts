import { z } from "zod";
import { dateStringSchema } from "./date.js";

const finiteNumberSchema = z.number().refine(Number.isFinite, "Expected a finite number");

export const evidenceValueSchema = z.union([finiteNumberSchema, z.string(), z.boolean(), z.null()]);

export const findingEvidenceSchema = z.record(z.string(), evidenceValueSchema);
export type FindingEvidence = z.infer<typeof findingEvidenceSchema>;

export const findingThresholdsSchema = z.record(z.string(), finiteNumberSchema);
export type FindingThresholds = z.infer<typeof findingThresholdsSchema>;

export const severitySchema = z.enum(["info", "warning", "critical"]);
export type FindingSeverity = z.infer<typeof severitySchema>;

export const findingLevelSchema = z.enum(["etf", "market"]);
export type FindingLevel = z.infer<typeof findingLevelSchema>;

export const snapshotReferenceSchema = z.object({
  analysisDate: dateStringSchema,
  snapshotVersion: z.number().int().positive(),
});

export type SnapshotReference = z.infer<typeof snapshotReferenceSchema>;

export const findingSchema = z
  .object({
    id: z.string().min(1),
    ruleCode: z.string().min(1),
    ruleVersion: z.string().min(1),
    level: findingLevelSchema,
    etfCode: z.string().min(1).optional(),
    severity: severitySchema,
    title: z.string().min(1),
    description: z.string().min(1),
    evidence: findingEvidenceSchema,
    thresholds: findingThresholdsSchema,
    snapshotRef: snapshotReferenceSchema,
  })
  .superRefine((finding, context) => {
    if (finding.level === "etf" && finding.etfCode === undefined) {
      context.addIssue({
        code: "custom",
        path: ["etfCode"],
        message: "ETF findings require etfCode",
      });
    }
    if (finding.level === "market" && finding.etfCode !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["etfCode"],
        message: "Market findings must not include etfCode",
      });
    }
  });

export type Finding = z.infer<typeof findingSchema>;

export const findingsFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisDate: dateStringSchema,
    snapshotVersion: z.number().int().positive(),
    level: findingLevelSchema,
    ruleVersion: z.string().min(1),
    items: z.array(findingSchema),
  })
  .superRefine((file, context) => {
    const ids = new Set<string>();
    for (const [index, item] of file.items.entries()) {
      if (item.level !== file.level) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "level"],
          message: "Finding level must match its file level",
        });
      }
      if (item.ruleVersion !== file.ruleVersion) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "ruleVersion"],
          message: "Finding ruleVersion must match its file ruleVersion",
        });
      }
      if (
        item.snapshotRef.analysisDate !== file.analysisDate ||
        item.snapshotRef.snapshotVersion !== file.snapshotVersion
      ) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "snapshotRef"],
          message: "Finding snapshotRef must match its file",
        });
      }
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "id"],
          message: `Duplicate finding id: ${item.id}`,
        });
      }
      ids.add(item.id);
    }
  });

export type FindingsFile = z.infer<typeof findingsFileSchema>;
