export type BackupErrorCode =
  | "BACKUP_PATH_INVALID"
  | "BACKUP_NOT_FOUND"
  | "BACKUP_INVALID"
  | "BACKUP_CHECKSUM_MISMATCH"
  | "BACKUP_ALREADY_EXISTS"
  | "RESTORE_FAILED"
  | "RESTORE_ROLLBACK_FAILED";

export interface BackupErrorOptions {
  code: BackupErrorCode;
  message: string;
  path?: string;
  cause?: unknown;
}

export class BackupError extends Error {
  readonly code: BackupErrorCode;
  readonly path: string | undefined;

  constructor(options: BackupErrorOptions) {
    super(options.message);
    this.name = "BackupError";
    this.code = options.code;
    this.path = options.path;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isBackupError(error: unknown): error is BackupError {
  return error instanceof BackupError;
}
