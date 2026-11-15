import { z } from "zod";
import { dateStringSchema } from "./date.js";

const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const REPORT_TYPES = [
  "daily_market_report",
  "etf_deep_dive",
  "market_anomaly",
  "risk_note",
  "valuation_note",
] as const;

export const reportTypeSchema = z.enum(REPORT_TYPES);
export type ReportType = z.infer<typeof reportTypeSchema>;

export const REPORT_MODES = ["template", "ai"] as const;
export const reportModeSchema = z.enum(REPORT_MODES);
export type ReportMode = z.infer<typeof reportModeSchema>;

export const REPORT_STATUSES = ["success", "failed"] as const;
export const reportStatusSchema = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const reportModelSchema = z.object({
  provider: z.string().min(1),
  name: z.string().min(1),
  promptVersion: z.string().min(1),
});

export type ReportModel = z.infer<typeof reportModelSchema>;

export const reportCitationSchema = z.object({
  path: z
    .string()
    .min(1)
    .refine(
      (path) =>
        !path.startsWith("/") &&
        !path.includes("\\") &&
        !path.split("/").some((segment) => segment === "" || segment === "." || segment === ".."),
      "Citation path must be a normalized relative path",
    ),
  field: z
    .string()
    .refine(
      (field) => field === "" || (field.startsWith("/") && /^(?:\/(?:[^~/]|~[01])*)+$/.test(field)),
      "Citation field must be an RFC 6901 JSON Pointer",
    ),
});

export type ReportCitation = z.infer<typeof reportCitationSchema>;

export const reportErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
});

export type ReportError = z.infer<typeof reportErrorSchema>;

export const reportSectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
  citations: z.array(reportCitationSchema),
});

export type ReportSection = z.infer<typeof reportSectionSchema>;

export const reportKeyFindingSchema = z.object({
  ruleCode: z.string().min(1),
  text: z.string().min(1),
});

export type ReportKeyFinding = z.infer<typeof reportKeyFindingSchema>;

export const reportContentSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  sections: z.array(reportSectionSchema),
  keyFindings: z.array(reportKeyFindingSchema),
});

export type ReportContent = z.infer<typeof reportContentSchema>;

export const reportIdSchema = z.string().regex(/^report_\d{8}_\d{3,}$/);

export const reportSchema = z
  .object({
    schemaVersion: z.literal(1),
    reportId: reportIdSchema,
    analysisDate: dateStringSchema,
    snapshotVersion: z.number().int().positive(),
    type: reportTypeSchema,
    mode: reportModeSchema,
    status: reportStatusSchema,
    model: reportModelSchema.nullable(),
    fallbackFrom: z.literal("ai").nullable(),
    generatedAt: z.string().min(1),
    inputFingerprint: checksumSchema,
    content: reportContentSchema,
    citations: z.array(reportCitationSchema),
    error: reportErrorSchema.nullable(),
  })
  .superRefine((report, context) => {
    if (report.mode === "ai" && report.model === null) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "AI reports require model metadata",
      });
    }
    if (report.mode === "template" && report.fallbackFrom !== null && report.error === null) {
      context.addIssue({
        code: "custom",
        path: ["error"],
        message: "Template fallback reports must retain the AI failure",
      });
    }
    if (report.status === "failed" && report.error === null) {
      context.addIssue({
        code: "custom",
        path: ["error"],
        message: "Failed reports require an error",
      });
    }
    if (report.status === "success" && report.content.sections.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["content", "sections"],
        message: "Successful reports require at least one section",
      });
    }
  });

export type Report = z.infer<typeof reportSchema>;

export const reportSummarySchema = z.object({
  reportId: reportIdSchema,
  analysisDate: dateStringSchema,
  snapshotVersion: z.number().int().positive(),
  type: reportTypeSchema,
  mode: reportModeSchema,
  status: reportStatusSchema,
  model: reportModelSchema.nullable(),
  fallbackFrom: z.literal("ai").nullable(),
  generatedAt: z.string().min(1),
  inputFingerprint: checksumSchema,
});

export type ReportSummary = z.infer<typeof reportSummarySchema>;

export const reportIndexSchema = z.object({
  schemaVersion: z.literal(1),
  analysisDate: dateStringSchema,
  updatedAt: z.string().min(1),
  reports: z.array(reportSummarySchema),
});

export type ReportIndex = z.infer<typeof reportIndexSchema>;

export function reportSummaryOf(report: Report): ReportSummary {
  return reportSummarySchema.parse({
    reportId: report.reportId,
    analysisDate: report.analysisDate,
    snapshotVersion: report.snapshotVersion,
    type: report.type,
    mode: report.mode,
    status: report.status,
    model: report.model,
    fallbackFrom: report.fallbackFrom,
    generatedAt: report.generatedAt,
    inputFingerprint: report.inputFingerprint,
  });
}
