import { z } from "zod";

export const warningContextValueSchema = z.union([
  z.string(),
  z.number().refine(Number.isFinite, "Expected a finite number"),
  z.boolean(),
  z.null(),
]);

export type WarningContextValue = z.infer<typeof warningContextValueSchema>;

export const warningItemSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "Warning code must use uppercase snake case"),
  message: z.string().min(1),
  context: z.record(z.string(), warningContextValueSchema).optional(),
});

export type WarningItem = z.infer<typeof warningItemSchema>;

export function normalizeWarnings(
  warnings: readonly (string | WarningItem)[] | undefined,
): WarningItem[] {
  if (warnings === undefined) {
    return [];
  }

  const normalized = warnings.map((warning) => {
    if (typeof warning !== "string") {
      return warningItemSchema.parse(warning);
    }
    const separator = warning.indexOf(":");
    const candidate = separator >= 0 ? warning.slice(0, separator) : warning;
    const code = /^[A-Z][A-Z0-9_]*$/.test(candidate) ? candidate : "WARNING";
    return warningItemSchema.parse({ code, message: warning });
  });

  const unique = new Map<string, WarningItem>();
  for (const warning of normalized) {
    const key = `${warning.code}\u0000${warning.message}`;
    if (!unique.has(key)) {
      unique.set(key, warning);
    }
  }
  return [...unique.values()].sort((left, right) =>
    `${left.code}\u0000${left.message}`.localeCompare(`${right.code}\u0000${right.message}`),
  );
}
