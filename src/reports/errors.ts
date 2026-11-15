export type ReportErrorCode =
  | "REPORT_AI_UNAVAILABLE"
  | "REPORT_AI_FAILED"
  | "REPORT_AI_INVALID_JSON"
  | "REPORT_AI_SCHEMA_INVALID"
  | "REPORT_CITATION_INVALID"
  | "REPORT_TEMPLATE_FAILED"
  | "REPORT_WRITE_FAILED"
  | "REPORT_NOT_FOUND"
  | "REPORT_INDEX_CORRUPT";

export interface ReportServiceErrorOptions {
  code: ReportErrorCode;
  message: string;
  retryable?: boolean;
  context?: Record<string, unknown>;
  cause?: unknown;
}

export class ReportServiceError extends Error {
  readonly code: ReportErrorCode;
  readonly retryable: boolean;
  readonly context: Record<string, unknown>;

  constructor(options: ReportServiceErrorOptions) {
    super(options.message);
    this.name = "ReportServiceError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.context = options.context ?? {};
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isReportServiceError(error: unknown): error is ReportServiceError {
  return error instanceof ReportServiceError;
}

export function reportErrorMessage(error: unknown): string {
  if (isReportServiceError(error)) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
