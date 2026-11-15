import { z } from "zod";

export const sourceConfigSchema = z.object({
  schemaVersion: z.literal(1),
  baseUrl: z.string().url(),
  timeoutMs: z.number().int().positive(),
  retries: z.number().int().nonnegative(),
  retryBaseDelayMs: z.number().int().nonnegative(),
  retryJitterMs: z.number().int().nonnegative(),
  concurrency: z.number().int().positive(),
  minIntervalMs: z.number().int().nonnegative(),
  etfPageSize: z.number().int().positive(),
  klineLimit: z.number().int().positive(),
  valuationInterval: z.string().min(1),
  percentileScale: z.enum(["percent", "fraction"]),
  premiumRateScale: z.enum(["percent", "fraction"]),
  changePercentScale: z.enum(["percent", "fraction"]),
  headers: z.record(z.string(), z.string()),
});

export type SourceConfig = z.infer<typeof sourceConfigSchema>;

const categoryChildSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

export const categoriesConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: z.number().int().positive(),
    categories: z
      .array(
        z.object({
          code: z.string().min(1),
          name: z.string().min(1),
          children: z.array(categoryChildSchema).min(1),
        }),
      )
      .min(1),
  })
  .superRefine((config, context) => {
    const primaryCodes = new Set<string>();
    const secondaryCodes = new Set<string>();

    for (const [primaryIndex, category] of config.categories.entries()) {
      if (primaryCodes.has(category.code)) {
        context.addIssue({
          code: "custom",
          path: ["categories", primaryIndex, "code"],
          message: `Duplicate primary category code: ${category.code}`,
        });
      }
      primaryCodes.add(category.code);

      for (const [secondaryIndex, child] of category.children.entries()) {
        if (secondaryCodes.has(child.code)) {
          context.addIssue({
            code: "custom",
            path: ["categories", primaryIndex, "children", secondaryIndex, "code"],
            message: `Duplicate secondary category code: ${child.code}`,
          });
        }
        secondaryCodes.add(child.code);
      }
    }
  });

export const categoryMappingSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: z.number().int().positive(),
    updatedAt: z.string().min(1),
    items: z.array(
      z.object({
        etfCode: z.string().min(1),
        primaryCode: z.string().min(1).nullable(),
        secondaryCode: z.string().min(1).nullable(),
        status: z.enum(["pending", "confirmed"]),
        reason: z.string(),
        confidence: z.number().min(0).max(1),
        updatedAt: z.string().min(1),
      }),
    ),
  })
  .superRefine((mapping, context) => {
    const etfCodes = new Set<string>();

    for (const [index, item] of mapping.items.entries()) {
      if (etfCodes.has(item.etfCode)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "etfCode"],
          message: `Duplicate ETF mapping: ${item.etfCode}`,
        });
      }
      etfCodes.add(item.etfCode);

      if (item.status === "confirmed" && (!item.primaryCode || !item.secondaryCode)) {
        context.addIssue({
          code: "custom",
          path: ["items", index],
          message: "Confirmed classification requires both primaryCode and secondaryCode",
        });
      }
    }
  });

export const categoryOverridesSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(
    z.object({
      etfCode: z.string().min(1),
      primaryCode: z.string().min(1),
      secondaryCode: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
});

export const categorySuggestionsSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().min(1).optional(),
  items: z.array(
    z.object({
      etfCode: z.string().min(1),
      primaryCode: z.string().min(1).nullable(),
      secondaryCode: z.string().min(1).nullable(),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
      source: z.enum(["override", "keyword", "heuristic", "none"]),
    }),
  ),
});

const positiveIntegerArraySchema = z
  .array(z.number().int().positive())
  .min(1)
  .refine((values) => values.every((value, index) => index === 0 || value > values[index - 1]!), {
    message: "Periods must be strictly ascending",
  });

export const calculationConfigSchema = z.object({
  schemaVersion: z.literal(1),
  algorithmVersion: z.string().min(1),
  annualizationDays: z.number().int().positive(),
  riskFreeRateAnnual: z.number(),
  volatilityDdof: z.union([z.literal(0), z.literal(1)]),
  klineLookbackRows: z.number().int().positive(),
  returnPeriods: positiveIntegerArraySchema,
  movingAveragePeriods: positiveIntegerArraySchema,
  volatilityPeriods: positiveIntegerArraySchema,
  drawdownPeriods: positiveIntegerArraySchema,
  historyPeriods: z.object({
    "1m": z.number().int().positive(),
    "3m": z.number().int().positive(),
    "6m": z.number().int().positive(),
    "1y": z.number().int().positive(),
    "2y": z.number().int().positive(),
  }),
  bollinger: z.object({
    period: z.number().int().positive(),
    standardDeviation: z.number().positive(),
  }),
  trendAlignment: z.object({
    periods: positiveIntegerArraySchema,
    requireCloseAboveShortest: z.boolean(),
    strict: z.boolean(),
  }),
  valuationFreshness: z.object({
    freshDays: z.number().int().nonnegative(),
    maxUsableDays: z.number().int().positive(),
  }),
  activity: z.object({
    minAmountSampleRatio: z.number().min(0).max(1),
  }),
  ranking: z.object({
    minSample: z.number().int().positive(),
    tieTolerance: z.number().nonnegative(),
    overall: z.object({
      enabled: z.boolean(),
      weights: z.record(z.string(), z.number()),
    }),
  }),
  distributionBins: z.object({
    return1d: z.array(z.number()),
    return20d: z.array(z.number()),
    volatility: z.array(z.number()),
    drawdown: z.array(z.number()),
  }),
  marketState: z.object({
    strongPositiveRatio: z.number(),
    weakPositiveRatio: z.number(),
    strongMedianReturn20d: z.number(),
    weakMedianReturn20d: z.number(),
    strongAboveMa20Ratio: z.number(),
    weakAboveMa20Ratio: z.number(),
    highVolatility20d: z.number(),
    riskRisingPositiveRatioMax: z.number(),
    highDrawdown60d: z.number(),
    highRiskScore: z.number(),
    highDispersion20d: z.number(),
    dispersionPositiveRatioMin: z.number(),
    dispersionPositiveRatioMax: z.number(),
    activityImprovement: z.number(),
    activityPositiveRatioMin: z.number(),
    riskConcentrationRatio: z.number(),
  }),
});

export type CalculationConfig = z.infer<typeof calculationConfigSchema>;

export const ruleConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    ruleVersion: z.string().min(1),
    rules: z.array(
      z.object({
        code: z.string().min(1),
        enabled: z.boolean(),
        level: z.enum(["etf", "market"]),
        severity: z.enum(["info", "warning", "critical"]),
        maxFindings: z.number().int().positive(),
        description: z.string().min(1),
        params: z.record(z.string(), z.number()),
      }),
    ),
  })
  .superRefine((config, context) => {
    const codes = new Set<string>();
    for (const [index, rule] of config.rules.entries()) {
      if (codes.has(rule.code)) {
        context.addIssue({
          code: "custom",
          path: ["rules", index, "code"],
          message: `Duplicate rule code: ${rule.code}`,
        });
      }
      codes.add(rule.code);
    }
  });

export type RuleConfig = z.infer<typeof ruleConfigSchema>;
