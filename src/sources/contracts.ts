import { z } from "zod";
import { SourceError } from "./errors.js";

const businessCodeSchema = z.union([z.string(), z.number()]);
const rawNumberSchema = z.union([z.number(), z.string(), z.null()]).optional();

export const rawEtfSchema = z
  .object({
    securityName: z.string().nullish(),
    securityCode: z.string().nullish(),
    securityFullName: z.string().nullish(),
    scale: rawNumberSchema,
    trackingIndex: z.string().nullish(),
    trackIndex: z.string().nullish(),
    premiumRate: rawNumberSchema,
    amount: rawNumberSchema,
    price: rawNumberSchema,
    changePercent: rawNumberSchema,
    valuePercent: z.number().nullish(),
    tradeDate: z.number().nullish(),
  })
  .loose();

export type RawEtf = z.infer<typeof rawEtfSchema>;

export const etfListResponseSchema = z
  .object({
    code: businessCodeSchema,
    msg: z.string().nullish(),
    data: z
      .object({
        total: z.number().nonnegative(),
        data: z.array(rawEtfSchema),
      })
      .loose(),
  })
  .loose();

export const klineResponseSchema = z
  .object({
    code: businessCodeSchema,
    msg: z.string().nullish(),
    data: z
      .object({
        securityCode: z.string().optional(),
        columns: z.string(),
        items: z.string().nullish(),
      })
      .loose(),
  })
  .loose();

const rawValuationItemSchema = z
  .object({
    tradeDate: z.string(),
    valuationValue: z.number(),
    historicalPercentile: z.number().nullish(),
    peg: z.number().nullish(),
  })
  .loose();

export const valuationResponseSchema = z
  .object({
    code: businessCodeSchema,
    msg: z.string().nullish(),
    data: z
      .object({
        items: z.array(z.unknown()).nullish(),
      })
      .loose(),
  })
  .loose();

export function assertBusinessSuccess(body: unknown, label: string): void {
  if (!body || typeof body !== "object" || !("code" in body)) {
    throw new SourceError({
      code: "SOURCE_PAYLOAD",
      message: `${label}: response has no business code`,
      retryable: false,
    });
  }

  const code = String((body as { code: string | number }).code);
  if (code !== "200") {
    const message = "msg" in body ? String((body as { msg?: unknown }).msg ?? "") : "";
    throw new SourceError({
      code: "SOURCE_BUSINESS",
      message: `${label}: business code=${code}${message ? `, msg=${message}` : ""}`,
      retryable: false,
      businessCode: code,
    });
  }
}

export function parseWirePayload<T>(schema: z.ZodType<T>, body: unknown, label: string): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }

  throw new SourceError({
    code: "SOURCE_PAYLOAD",
    message: `${label}: invalid response payload`,
    retryable: false,
    context: {
      issues: formatZodIssues(parsed.error),
    },
  });
}

export function parseValuationItem(value: unknown): z.infer<typeof rawValuationItemSchema> | null {
  const parsed = rawValuationItemSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}

export function businessCodeOf(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("code" in body)) {
    return null;
  }
  return String((body as { code: string | number }).code);
}
