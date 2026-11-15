import type { z } from "zod";
import type {
  calculationConfigSchema,
  categoryMappingSchema,
  ruleConfigSchema,
  sourceConfigSchema,
} from "./schemas.js";
import { checksumJson } from "../storage/checksum.js";

export function configHashOf(
  source: z.infer<typeof sourceConfigSchema>,
  calculation: z.infer<typeof calculationConfigSchema>,
): string {
  return checksumJson({ source, calculation });
}

export function ruleConfigHashOf(ruleConfig: z.infer<typeof ruleConfigSchema>): string {
  return checksumJson(ruleConfig);
}

export function categoryMappingHashOf(mapping: z.infer<typeof categoryMappingSchema>): string {
  return checksumJson({
    version: mapping.version,
    items: mapping.items
      .map((item) => ({
        etfCode: item.etfCode,
        primaryCode: item.primaryCode,
        secondaryCode: item.secondaryCode,
        status: item.status,
      }))
      .sort((left, right) => left.etfCode.localeCompare(right.etfCode)),
  });
}
