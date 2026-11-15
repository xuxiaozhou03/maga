export type SourceErrorCode =
  | "SOURCE_HTTP"
  | "SOURCE_BUSINESS"
  | "SOURCE_PAYLOAD"
  | "SOURCE_UNSUPPORTED"
  | "SOURCE_TIMEOUT"
  | "SOURCE_RATE_LIMIT";

export type SourceErrorContext = Record<string, string | number | boolean | null | undefined>;

export interface SourceErrorOptions {
  code: SourceErrorCode;
  message: string;
  retryable: boolean;
  httpStatus?: number | undefined;
  businessCode?: string | undefined;
  context?: SourceErrorContext | undefined;
  cause?: unknown;
}

export class SourceError extends Error {
  readonly code: SourceErrorCode;
  readonly retryable: boolean;
  readonly httpStatus: number | undefined;
  readonly businessCode: string | undefined;
  readonly context: SourceErrorContext;

  constructor(options: SourceErrorOptions) {
    super(options.message);
    this.name = "SourceError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.httpStatus = options.httpStatus;
    this.businessCode = options.businessCode;
    this.context = options.context ?? {};

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      httpStatus: this.httpStatus,
      businessCode: this.businessCode,
      context: this.context,
    };
  }
}

export function isSourceError(error: unknown): error is SourceError {
  return error instanceof SourceError;
}
