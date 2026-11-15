import { isRealDate } from "../domain/date.js";
import { rankingCodeSchema, type RankingCode } from "../domain/rankings.js";
import { ApiError } from "./errors.js";

export function parseDateParam(value: string | undefined, name = "date"): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isRealDate(value)) {
    throw invalid(`${name} must be a real date in YYYY-MM-DD format`);
  }
  return value;
}

export function parseVersionParam(value: string | undefined, name = "version"): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw invalid(`${name} must be a positive integer`);
  }
  return parsed;
}

export function parsePositiveInteger(
  value: string | undefined,
  options: { name: string; defaultValue: number; minimum: number; maximum: number },
): number {
  if (value === undefined || value === "") {
    return options.defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < options.minimum || parsed > options.maximum) {
    throw invalid(
      `${options.name} must be an integer between ${options.minimum} and ${options.maximum}`,
    );
  }
  return parsed;
}

export function parsePageParams(searchParams: URLSearchParams): {
  page: number;
  pageSize: number;
} {
  return {
    page: parsePositiveInteger(searchParams.get("page") ?? undefined, {
      name: "page",
      defaultValue: 1,
      minimum: 1,
      maximum: 1_000_000,
    }),
    pageSize: parsePositiveInteger(searchParams.get("pageSize") ?? undefined, {
      name: "pageSize",
      defaultValue: 50,
      minimum: 1,
      maximum: 200,
    }),
  };
}

export function parseEtfCode(value: string): string {
  if (!/^[A-Za-z0-9]+\.[A-Za-z0-9]+$/.test(value)) {
    throw invalid("ETF code must include a market suffix");
  }
  return value;
}

export function parseRankingCode(value: string | undefined): RankingCode {
  const parsed = rankingCodeSchema.safeParse(value ?? "return_20d");
  if (!parsed.success) {
    throw invalid("Unknown ranking code");
  }
  return parsed.data;
}

export function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string,
  fallback?: T,
): T | undefined {
  if (value === undefined || value === "") {
    return fallback;
  }
  if (!allowed.includes(value as T)) {
    throw invalid(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function parseShortText(
  value: string | undefined,
  name: string,
  maxLength = 100,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw invalid(`${name} must not exceed ${maxLength} characters`);
  }
  return trimmed === "" ? undefined : trimmed;
}

export function invalid(message: string): ApiError {
  return new ApiError("INVALID_QUERY", 400, message);
}

export function parseSnapshotQuery(searchParams: URLSearchParams): {
  date?: string;
  version?: number;
} {
  const date = parseDateParam(searchParams.get("date") ?? undefined);
  const version = parseVersionParam(searchParams.get("version") ?? undefined);
  return {
    ...(date === undefined ? {} : { date }),
    ...(version === undefined ? {} : { version }),
  };
}
