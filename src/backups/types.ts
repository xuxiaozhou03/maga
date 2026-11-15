import { z } from "zod";

const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const BACKUP_DIRECTORIES = [
  "config",
  "master",
  "valuation",
  "snapshots",
  "reports",
  "system/selection",
] as const;

export const BACKUP_STATE_FILES = ["system/current.json", "system/snapshot-index.json"] as const;

export const backupEntrySchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  checksum: checksumSchema,
});

export type BackupEntry = z.infer<typeof backupEntrySchema>;

export const backupManifestSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: z.string().min(1),
  includeTasks: z.boolean(),
  directories: z.array(z.string().min(1)),
  entries: z.array(backupEntrySchema),
  totals: z.object({
    files: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
  }),
});

export type BackupManifest = z.infer<typeof backupManifestSchema>;

export interface BackupResult {
  backupPath: string;
  manifest: BackupManifest;
}

export interface BackupValidationResult {
  backupPath: string;
  manifest: BackupManifest;
  verifiedFiles: number;
  verifiedBytes: number;
}
