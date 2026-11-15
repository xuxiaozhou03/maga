import { z } from "zod";
import { dateStringSchema } from "./date.js";
import { warningItemSchema } from "./warnings.js";

export const TASK_STATUSES = [
  "pending",
  "running",
  "success",
  "partial_success",
  "failed",
  "skipped",
] as const;

export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const STEP_STATUSES = ["pending", "running", "success", "failed", "skipped"] as const;

export const stepStatusSchema = z.enum(STEP_STATUSES);
export type StepStatus = z.infer<typeof stepStatusSchema>;

export const TASK_TYPES = [
  "first_run",
  "daily_analysis",
  "pool_refresh",
  "valuation_refresh",
  "recompute",
  "valuation_recompute",
  "report",
  "maintenance",
] as const;

export const taskTypeSchema = z.enum(TASK_TYPES);
export type TaskType = z.infer<typeof taskTypeSchema>;

const finiteNumberSchema = z.number().refine(Number.isFinite, "Expected a finite number");

export const taskErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  step: z.string().min(1).optional(),
  retryable: z.boolean(),
  context: z
    .record(z.string(), z.union([z.string(), finiteNumberSchema, z.boolean(), z.null()]))
    .optional(),
});

export type TaskError = z.infer<typeof taskErrorSchema>;

export const taskStepSchema = z.object({
  name: z.string().min(1),
  status: stepStatusSchema,
  startedAt: z.string().min(1).nullable(),
  finishedAt: z.string().min(1).nullable(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  warnings: z.number().int().nonnegative(),
  error: taskErrorSchema.nullable(),
});

export type TaskStep = z.infer<typeof taskStepSchema>;

export const taskRecordSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.string().regex(/^task_\d{4}-\d{2}-\d{2}_\d{8}T\d{6}Z_[a-f0-9]{6}$/),
  type: taskTypeSchema,
  status: taskStatusSchema,
  analysisDate: dateStringSchema,
  trigger: z.string().min(1),
  reason: z.string().min(1).nullable(),
  requestedAt: z.string().min(1),
  startedAt: z.string().min(1).nullable(),
  finishedAt: z.string().min(1).nullable(),
  steps: z.array(taskStepSchema),
  snapshotVersion: z.number().int().positive().nullable(),
  inputFingerprint: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .nullable(),
  warnings: z.array(warningItemSchema),
  error: taskErrorSchema.nullable(),
});

export type TaskRecord = z.infer<typeof taskRecordSchema>;

export const TASK_STEP_NAMES = [
  "fetch_etfs",
  "select_pool",
  "fetch_klines",
  "validate_klines",
  "fetch_valuations",
  "upsert_valuations",
  "calculate_features",
  "calculate_rankings",
  "calculate_market",
  "evaluate_rules",
  "build_snapshot",
  "validate_snapshot",
  "publish_snapshot",
  "generate_report",
] as const;
