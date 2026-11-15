export type PoolRefreshErrorCode = "POOL_EMPTY" | "POOL_CHANGE_GUARD";

export class PoolRefreshError extends Error {
  readonly code: PoolRefreshErrorCode;
  readonly context: Record<string, unknown>;

  constructor(code: PoolRefreshErrorCode, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = "PoolRefreshError";
    this.code = code;
    this.context = context;
  }
}

export type ValuationRefreshErrorCode = "POOL_MISSING" | "POOL_EMPTY" | "INVALID_ANALYSIS_DATE";

export class ValuationRefreshError extends Error {
  readonly code: ValuationRefreshErrorCode;
  readonly context: Record<string, unknown>;

  constructor(
    code: ValuationRefreshErrorCode,
    message: string,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ValuationRefreshError";
    this.code = code;
    this.context = context;
  }
}
