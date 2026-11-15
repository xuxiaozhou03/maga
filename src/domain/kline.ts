import { z } from "zod";
import { dateStringSchema } from "./date.js";

export const MAX_KLINE_CACHE_ROWS = 1000;

const finiteNumberSchema = z.number().refine(Number.isFinite, "Expected a finite number");
const positiveNumberSchema = finiteNumberSchema.positive();
const nonNegativeNumberSchema = finiteNumberSchema.nonnegative();

export const chartKlineRowSchema = z
  .object({
    date: dateStringSchema,
    open: positiveNumberSchema,
    high: positiveNumberSchema,
    low: positiveNumberSchema,
    close: positiveNumberSchema,
    volume: nonNegativeNumberSchema,
    amount: nonNegativeNumberSchema.nullable(),
  })
  .superRefine((row, context) => {
    if (row.high < row.low) {
      context.addIssue({
        code: "custom",
        path: ["high"],
        message: "high must be greater than or equal to low",
      });
    }
  });

export type ChartKlineRow = z.infer<typeof chartKlineRowSchema>;

export const klineCacheFileSchema = z
  .object({
    code: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/, "Invalid ETF code"),
    updatedAt: z.string().min(1),
    source: z.literal("hongsehuojian"),
    adjust: z.literal(1),
    rows: z.array(chartKlineRowSchema).max(MAX_KLINE_CACHE_ROWS),
  })
  .superRefine((file, context) => {
    let previousDate: string | null = null;
    for (const [index, row] of file.rows.entries()) {
      if (previousDate !== null && row.date <= previousDate) {
        context.addIssue({
          code: "custom",
          path: ["rows", index, "date"],
          message: "Cache rows must be strictly ascending by date",
        });
      }
      previousDate = row.date;
    }
  });

export type KlineCacheFile = z.infer<typeof klineCacheFileSchema>;

export function isEtfCode(value: string): boolean {
  return /^\d{6}\.(SH|SZ|BJ)$/.test(value);
}
