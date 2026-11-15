export type SnapshotErrorCode =
  | "SNAPSHOT_ALREADY_EXISTS"
  | "SNAPSHOT_INVALID"
  | "SNAPSHOT_VERIFY_FAILED"
  | "PUBLISH_GATE_FAILED"
  | "POOL_EMPTY"
  | "POOL_SIZE_CHANGE"
  | "KLINE_COVERAGE_LOW"
  | "PARTIAL_NOT_ALLOWED"
  | "TASK_FAILED";

export interface SnapshotErrorOptions {
  code: SnapshotErrorCode;
  message: string;
  context?: Record<string, unknown>;
  cause?: unknown;
}

export class SnapshotError extends Error {
  readonly code: SnapshotErrorCode;
  readonly context: Record<string, unknown>;

  constructor(options: SnapshotErrorOptions) {
    super(options.message);
    this.name = "SnapshotError";
    this.code = options.code;
    this.context = options.context ?? {};
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isSnapshotError(error: unknown): error is SnapshotError {
  return error instanceof SnapshotError;
}
