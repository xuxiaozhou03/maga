import type { SourceConfig } from "../config/schemas.js";
import { SourceError } from "./errors.js";
import type {
  FetchLike,
  HttpJsonRequestOptions,
  HttpJsonResult,
  JsonHttpClient,
  SourceLogger,
} from "./types.js";
import { silentLogger } from "./types.js";
import { businessCodeOf } from "./contracts.js";

export interface HttpClientDependencies {
  fetchImpl?: FetchLike;
  logger?: SourceLogger;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpClient implements JsonHttpClient {
  private readonly config: SourceConfig;
  private readonly fetchImpl: FetchLike;
  private readonly logger: SourceLogger;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;

  private activeRequests = 0;
  private nextStartAt = 0;
  private readonly waiters: Array<() => void> = [];
  private drainTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(config: SourceConfig, dependencies: HttpClientDependencies = {}) {
    this.config = config;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.logger = dependencies.logger ?? silentLogger;
    this.sleep = dependencies.sleep ?? defaultSleep;
    this.now = dependencies.now ?? Date.now;
    this.random = dependencies.random ?? Math.random;
  }

  async getJson(
    path: string,
    params: Record<string, string | number>,
    options: HttpJsonRequestOptions,
  ): Promise<HttpJsonResult> {
    const url = new URL(path, this.config.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    url.searchParams.set("ts", String(this.now()));

    const loggedUrl = new URL(url);
    loggedUrl.searchParams.delete("ts");
    const maxAttempts = this.config.retries + 1;
    let lastError: SourceError | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = this.now();
      let httpStatus = 0;
      await this.acquireSlot();

      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: this.config.headers,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
        httpStatus = response.status;

        if (!response.ok) {
          throw this.errorForHttpStatus(response.status, options.label);
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch (error) {
          throw new SourceError({
            code: "SOURCE_PAYLOAD",
            message: `${options.label}: response is not valid JSON`,
            retryable: false,
            httpStatus,
            cause: error,
          });
        }

        const durationMs = this.now() - startedAt;
        let itemCount: number | undefined;
        if (options.itemCount) {
          try {
            itemCount = options.itemCount(body);
          } catch {
            itemCount = undefined;
          }
        }

        this.logger.info(
          {
            event: "source_request",
            label: options.label,
            url: loggedUrl.toString(),
            attempt,
            durationMs,
            httpStatus,
            businessCode: businessCodeOf(body),
            itemCount,
            errorCode: null,
          },
          "upstream request completed",
        );

        return { body, url: loggedUrl.toString(), attempt, httpStatus, durationMs };
      } catch (error) {
        const sourceError = this.normalizeError(error, options.label, httpStatus);
        lastError = sourceError;
        this.logger.error(
          {
            event: "source_request",
            label: options.label,
            url: loggedUrl.toString(),
            attempt,
            durationMs: this.now() - startedAt,
            httpStatus,
            businessCode: null,
            itemCount: null,
            errorCode: sourceError.code,
            errorMessage: sourceError.message,
          },
          "upstream request failed",
        );

        if (!sourceError.retryable || attempt === maxAttempts) {
          throw sourceError;
        }
      } finally {
        this.releaseSlot();
      }

      await this.sleep(this.retryDelay(attempt));
    }

    throw (
      lastError ??
      new SourceError({
        code: "SOURCE_HTTP",
        message: `${options.label}: request failed`,
        retryable: true,
      })
    );
  }

  private errorForHttpStatus(status: number, label: string): SourceError {
    if (status === 429) {
      return new SourceError({
        code: "SOURCE_RATE_LIMIT",
        message: `${label}: upstream rate limit`,
        retryable: true,
        httpStatus: status,
      });
    }

    return new SourceError({
      code: "SOURCE_HTTP",
      message: `${label}: HTTP ${status}`,
      retryable: status === 408 || status >= 500,
      httpStatus: status,
    });
  }

  private normalizeError(error: unknown, label: string, httpStatus: number): SourceError {
    if (error instanceof SourceError) {
      return error;
    }

    const isTimeout =
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    return new SourceError({
      code: isTimeout ? "SOURCE_TIMEOUT" : "SOURCE_HTTP",
      message: isTimeout ? `${label}: request timed out` : `${label}: network request failed`,
      retryable: true,
      httpStatus: httpStatus || undefined,
      cause: error,
    });
  }

  private retryDelay(failedAttempt: number): number {
    const baseDelay = this.config.retryBaseDelayMs * 2 ** (failedAttempt - 1);
    const jitter = Math.floor(this.random() * (this.config.retryJitterMs + 1));
    return baseDelay + jitter;
  }

  private async acquireSlot(): Promise<void> {
    const now = this.now();
    if (this.activeRequests < this.config.concurrency && now >= this.nextStartAt) {
      this.activeRequests += 1;
      this.nextStartAt = now + this.config.minIntervalMs;
      return;
    }

    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      this.scheduleDrain();
    });
  }

  private releaseSlot(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.drainQueue();
  }

  private scheduleDrain(): void {
    if (this.drainTimer !== undefined || this.waiters.length === 0) {
      return;
    }

    const delay = Math.max(0, this.nextStartAt - this.now());
    this.drainTimer = setTimeout(() => {
      this.drainTimer = undefined;
      this.drainQueue();
    }, delay);
  }

  private drainQueue(): void {
    if (this.waiters.length === 0 || this.activeRequests >= this.config.concurrency) {
      return;
    }

    const now = this.now();
    if (now < this.nextStartAt) {
      this.scheduleDrain();
      return;
    }

    const resolve = this.waiters.shift();
    if (!resolve) {
      return;
    }

    this.activeRequests += 1;
    this.nextStartAt = now + this.config.minIntervalMs;
    resolve();
    this.scheduleDrain();
  }
}
