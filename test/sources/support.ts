import type { SourceConfig } from "../../src/config/schemas.js";
import type {
  HttpJsonRequestOptions,
  HttpJsonResult,
  JsonHttpClient,
  SourceLogger,
} from "../../src/sources/types.js";

export function makeSourceConfig(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    schemaVersion: 1,
    baseUrl: "https://example.test",
    timeoutMs: 1000,
    retries: 3,
    retryBaseDelayMs: 1,
    retryJitterMs: 0,
    concurrency: 2,
    minIntervalMs: 0,
    etfPageSize: 2000,
    klineLimit: 1000,
    valuationInterval: "last_5_years",
    percentileScale: "percent",
    premiumRateScale: "percent",
    changePercentScale: "percent",
    headers: { accept: "application/json" },
    ...overrides,
  };
}

export function httpResult(body: unknown, overrides: Partial<HttpJsonResult> = {}): HttpJsonResult {
  return {
    body,
    url: "https://example.test/request",
    attempt: 1,
    httpStatus: 200,
    durationMs: 1,
    ...overrides,
  };
}

export class StubHttpClient implements JsonHttpClient {
  readonly calls: Array<{
    path: string;
    params: Record<string, string | number>;
    options: HttpJsonRequestOptions;
  }> = [];

  constructor(
    private readonly responder: (
      path: string,
      params: Record<string, string | number>,
    ) => HttpJsonResult | Promise<HttpJsonResult>,
  ) {}

  async getJson(
    path: string,
    params: Record<string, string | number>,
    options: HttpJsonRequestOptions,
  ): Promise<HttpJsonResult> {
    this.calls.push({ path, params, options });
    return this.responder(path, params);
  }
}

export interface CapturedLog {
  level: "debug" | "info" | "warn" | "error";
  context: Record<string, unknown>;
  message: string | undefined;
}

export class CapturingLogger implements SourceLogger {
  readonly entries: CapturedLog[] = [];

  debug(context: Record<string, unknown>, message?: string): void {
    this.entries.push({ level: "debug", context, message });
  }

  info(context: Record<string, unknown>, message?: string): void {
    this.entries.push({ level: "info", context, message });
  }

  warn(context: Record<string, unknown>, message?: string): void {
    this.entries.push({ level: "warn", context, message });
  }

  error(context: Record<string, unknown>, message?: string): void {
    this.entries.push({ level: "error", context, message });
  }
}
