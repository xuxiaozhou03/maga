import { z } from "zod";
import { DataPaths } from "../storage/data-paths.js";
import { DataError, isDataError } from "../storage/errors.js";
import { checksumJson } from "../storage/checksum.js";
import { JsonStore } from "../storage/json-store.js";
import {
  calculationConfigSchema,
  categoriesConfigSchema,
  categoryMappingSchema,
  categoryOverridesSchema,
  categorySuggestionsSchema,
  ruleConfigSchema,
  sourceConfigSchema,
  type CalculationConfig,
  type RuleConfig,
  type SourceConfig,
} from "./schemas.js";

export interface AppConfig {
  source: SourceConfig;
  calculation: CalculationConfig;
  rules: RuleConfig;
  categories: z.infer<typeof categoriesConfigSchema>;
  categoryMapping: z.infer<typeof categoryMappingSchema>;
  categoryOverrides: z.infer<typeof categoryOverridesSchema>;
  categorySuggestions: z.infer<typeof categorySuggestionsSchema>;
  configHash: string;
}

export class ConfigLoader {
  private constructor(private readonly store: JsonStore) {}

  static async create(dataRoot?: string): Promise<ConfigLoader> {
    const paths = await DataPaths.create(dataRoot);
    await paths.ensureLayout();
    return new ConfigLoader(new JsonStore(paths));
  }

  async loadAll(): Promise<AppConfig> {
    const [
      source,
      calculation,
      rules,
      categories,
      categoryMapping,
      categoryOverrides,
      categorySuggestions,
    ] = await Promise.all([
      this.readRequired("source-config.json", sourceConfigSchema),
      this.readRequired("calculation-config.json", calculationConfigSchema),
      this.readRequired("rule-config.json", ruleConfigSchema),
      this.readRequired("categories.json", categoriesConfigSchema),
      this.readRequired("etf-category-mapping.json", categoryMappingSchema),
      this.readRequired("category-overrides.json", categoryOverridesSchema),
      this.readRequired("category-suggestions.json", categorySuggestionsSchema),
    ]);

    validateCategoryReferences({
      categories,
      mapping: categoryMapping,
      overrides: categoryOverrides,
      suggestions: categorySuggestions,
    });

    const configHash = checksumJson({
      source,
      calculation,
      rules,
      categories,
      categoryMapping,
      categoryOverrides,
      categorySuggestions,
    });

    return {
      source,
      calculation,
      rules,
      categories,
      categoryMapping,
      categoryOverrides,
      categorySuggestions,
      configHash,
    };
  }

  private async readRequired<T>(file: string, schema: z.ZodType<T>): Promise<T> {
    try {
      const value = await this.store.read(`config/${file}`, schema);
      if (value === null) {
        throw new DataError({
          code: "CONFIG_INVALID",
          message: `Required configuration file is missing: ${file}`,
          path: `config/${file}`,
        });
      }
      return value;
    } catch (error) {
      if (isDataError(error) && error.code === "CONFIG_INVALID") {
        throw error;
      }
      if (isDataError(error)) {
        throw new DataError({
          code: "CONFIG_INVALID",
          message: `Invalid configuration file: ${file}`,
          path: `config/${file}`,
          context: error.context,
          cause: error,
        });
      }
      throw error;
    }
  }
}

interface CategoryValidationInput {
  categories: z.infer<typeof categoriesConfigSchema>;
  mapping: z.infer<typeof categoryMappingSchema>;
  overrides: z.infer<typeof categoryOverridesSchema>;
  suggestions: z.infer<typeof categorySuggestionsSchema>;
}

function validateCategoryReferences(input: CategoryValidationInput): void {
  const categoryMap = new Map(
    input.categories.categories.map((category) => [
      category.code,
      new Set(category.children.map((child) => child.code)),
    ]),
  );

  const validateCodes = (
    primaryCode: string | null,
    secondaryCode: string | null,
    path: string,
  ): void => {
    if (primaryCode === null && secondaryCode === null) {
      return;
    }
    if (primaryCode === null || !categoryMap.has(primaryCode)) {
      throw invalidCategory(path, `Unknown primary category: ${String(primaryCode)}`);
    }
    if (secondaryCode === null || !categoryMap.get(primaryCode)?.has(secondaryCode)) {
      throw invalidCategory(
        path,
        `Unknown secondary category ${String(secondaryCode)} under ${primaryCode}`,
      );
    }
  };

  for (const [index, item] of input.mapping.items.entries()) {
    validateCodes(item.primaryCode, item.secondaryCode, `etf-category-mapping.items[${index}]`);
  }
  for (const [index, item] of input.overrides.items.entries()) {
    validateCodes(item.primaryCode, item.secondaryCode, `category-overrides.items[${index}]`);
  }
  for (const [index, item] of input.suggestions.items.entries()) {
    validateCodes(item.primaryCode, item.secondaryCode, `category-suggestions.items[${index}]`);
  }
}

function invalidCategory(path: string, message: string): DataError {
  return new DataError({
    code: "CONFIG_INVALID",
    message,
    path,
  });
}
