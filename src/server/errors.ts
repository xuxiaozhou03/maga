import { isReportServiceError } from "../reports/errors.js";
import { SnapshotReadError } from "../snapshots/snapshot-reader.js";
import { isSourceError } from "../sources/errors.js";
import { isDataError } from "../storage/errors.js";

export type ApiErrorCode =
  | "INVALID_QUERY"
  | "ETF_NOT_FOUND"
  | "SNAPSHOT_NOT_FOUND"
  | "SNAPSHOT_CORRUPT"
  | "REPORT_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "TASK_CONFLICT"
  | "DATA_CORRUPT"
  | "CONFIG_INVALID"
  | "UPSTREAM_UNAVAILABLE"
  | "ADMIN_FORBIDDEN"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface PublicError {
  code: ApiErrorCode;
  message: string;
  details: Record<string, unknown>;
}

export function toPublicError(error: unknown): PublicError {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof SnapshotReadError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  if (isReportServiceError(error)) {
    return {
      code: error.code === "REPORT_NOT_FOUND" ? "REPORT_NOT_FOUND" : "INTERNAL_ERROR",
      message: error.message,
      details: { reportCode: error.code, retryable: error.retryable },
    };
  }
  if (isSourceError(error)) {
    return {
      code: "UPSTREAM_UNAVAILABLE",
      message: error.message,
      details: { sourceCode: error.code, retryable: error.retryable },
    };
  }
  if (isDataError(error)) {
    if (error.code === "TASK_CONFLICT") {
      return { code: "TASK_CONFLICT", message: error.message, details: {} };
    }
    const code = error.code === "CONFIG_INVALID" ? "CONFIG_INVALID" : "DATA_CORRUPT";
    return {
      code,
      message: error.message,
      details: {},
    };
  }
  if (error instanceof RangeError) {
    return { code: "INVALID_QUERY", message: error.message, details: {} };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "Unexpected server error",
    details: {},
  };
}

export function statusForError(error: unknown): number {
  if (error instanceof ApiError) {
    return error.status;
  }
  if (error instanceof SnapshotReadError) {
    return error.code === "SNAPSHOT_NOT_FOUND" ? 404 : 500;
  }
  if (isReportServiceError(error)) {
    return error.code === "REPORT_NOT_FOUND" ? 404 : 500;
  }
  if (isSourceError(error)) {
    return 502;
  }
  if (isDataError(error)) {
    return error.code === "TASK_CONFLICT" ? 409 : 500;
  }
  if (error instanceof RangeError) {
    return 400;
  }
  return 500;
}
