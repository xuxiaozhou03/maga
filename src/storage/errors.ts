export type DataErrorCode =
  | "DATA_CORRUPT"
  | "CONFIG_INVALID"
  | "PATH_ESCAPE"
  | "INVALID_JSON"
  | "SCHEMA_INVALID"
  | "WRITE_FAILED"
  | "TASK_CONFLICT"
  | "LOCK_RELEASE_FAILED";

export interface DataErrorOptions {
  code: DataErrorCode;
  message: string;
  path?: string | undefined;
  context?: Record<string, unknown> | undefined;
  cause?: unknown;
}

export class DataError extends Error {
  readonly code: DataErrorCode;
  readonly path: string | undefined;
  readonly context: Record<string, unknown>;

  constructor(options: DataErrorOptions) {
    super(options.message);
    this.name = "DataError";
    this.code = options.code;
    this.path = options.path;
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
      path: this.path,
      context: this.context,
    };
  }
}

export function isDataError(error: unknown): error is DataError {
  return error instanceof DataError;
}
