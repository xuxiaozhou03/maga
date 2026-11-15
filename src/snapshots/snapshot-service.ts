import {
  inputDigestSchema,
  type InputDigest,
  type SnapshotDataStatus,
  type SnapshotManifest,
  type SnapshotReason,
} from "../domain/snapshot.js";
import type { TaskRecord, TaskType } from "../domain/task.js";
import { normalizeWarnings, type WarningItem } from "../domain/warnings.js";
import { LockManager, type LockHandle } from "../storage/lock-manager.js";
import type { DataPaths } from "../storage/data-paths.js";
import { JsonStore } from "../storage/json-store.js";
import { TaskService, taskErrorFromUnknown } from "../tasks/task-service.js";
import { SnapshotError } from "./errors.js";
import { fingerprintOfInputDigest } from "./input-digest.js";
import type { SnapshotPayload } from "./payload.js";
import { evaluatePublicationGate } from "./publish-gate.js";
import {
  findPublishedSnapshotByFingerprint,
  latestDirectoryVersionForDate,
  latestVersionForDate,
} from "./repository.js";
import { buildSnapshot } from "./snapshot-builder.js";
import { promoteBuiltSnapshot } from "./snapshot-publisher.js";
import {
  addManifestToSnapshotIndex,
  advanceCurrentPointer,
  buildSnapshotIndex,
  writeSnapshotIndex,
} from "./snapshot-system.js";
import { verifySnapshot } from "./snapshot-verifier.js";

export interface PublishSnapshotOptions {
  reason: SnapshotReason;
  trigger?: string;
  taskType?: TaskType;
  force?: boolean;
  allowPartial?: boolean;
  forcePoolChange?: boolean;
  requestedDataStatus?: SnapshotDataStatus;
  previousPoolCount?: number | null;
  lockMaxWaitMs?: number;
  taskId?: string;
}

export type PayloadFactory = (snapshotVersion: number) => Promise<SnapshotPayload>;

export interface SnapshotPublicationResult {
  taskId: string;
  task: TaskRecord;
  status: "success" | "partial_success" | "skipped";
  analysisDate: string;
  snapshotVersion: number;
  snapshotPath: string;
  inputFingerprint: string;
  warnings: WarningItem[];
}

export interface SnapshotServiceDependencies {
  now?: () => Date;
}

export class SnapshotService {
  private readonly now: () => Date;
  private readonly tasks: TaskService;

  constructor(
    private readonly paths: DataPaths,
    private readonly store: JsonStore,
    private readonly locks: LockManager,
    dependencies: SnapshotServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.tasks = new TaskService(paths, store, { now: this.now });
  }

  async publish(
    inputDigest: InputDigest,
    payloadFactory: PayloadFactory,
    options: PublishSnapshotOptions,
  ): Promise<SnapshotPublicationResult> {
    const digest = inputDigestSchema.parse(inputDigest);
    const inputFingerprint = fingerprintOfInputDigest(digest);
    const task = await this.tasks.create({
      type: options.taskType ?? "daily_analysis",
      analysisDate: digest.analysisDate,
      trigger: options.trigger ?? "cli",
      reason: options.reason,
      ...(options.taskId === undefined ? {} : { taskId: options.taskId }),
    });
    await this.tasks.start(task.taskId);

    let lock: LockHandle | null = null;
    let activeStep: string | null = null;
    try {
      lock = await this.locks.acquire(
        `daily-${digest.analysisDate}`,
        { taskId: task.taskId, reason: options.reason },
        { maxWaitMs: options.lockMaxWaitMs ?? 60_000 },
      );
      await this.store.writeAtomic(
        this.paths.taskTempFile(task.taskId, "input-digest.json"),
        digest,
        inputDigestSchema,
      );

      const existing = await findPublishedSnapshotByFingerprint(
        this.paths,
        this.store,
        digest.analysisDate,
        inputFingerprint,
      );
      if (existing !== null && !options.force) {
        const verification = await verifySnapshot(
          this.paths,
          this.store,
          existing.directory.relativePath,
          { allowedStatuses: ["published"] },
        );
        if (verification.valid) {
          activeStep = "publish_snapshot";
          await this.tasks.beginStep(task.taskId, activeStep);
          await this.tasks.finishStep(task.taskId, activeStep, {
            status: "skipped",
            counts: { version: existing.manifest.snapshotVersion },
          });
          activeStep = null;
          const finished = await this.tasks.finish(task.taskId, {
            status: "skipped",
            snapshotVersion: existing.manifest.snapshotVersion,
            inputFingerprint,
            warnings: [],
          });
          return {
            taskId: task.taskId,
            task: finished,
            status: "skipped",
            analysisDate: digest.analysisDate,
            snapshotVersion: existing.manifest.snapshotVersion,
            snapshotPath: existing.directory.relativePath,
            inputFingerprint,
            warnings: [],
          };
        }
      }

      const gate = evaluatePublicationGate({
        poolCount: digest.etfs.length,
        klineValidCount: digest.etfs.filter((item) => item.lastDate === digest.analysisDate).length,
        previousPoolCount: options.previousPoolCount ?? null,
        allowPartial: options.allowPartial ?? false,
        forcePoolChange: options.forcePoolChange ?? false,
        requestedDataStatus: options.requestedDataStatus ?? "complete",
      });

      const latestDirectoryVersion = await latestDirectoryVersionForDate(
        this.paths,
        digest.analysisDate,
      );
      const latestPublishedVersion = await latestVersionForDate(
        this.paths,
        this.store,
        digest.analysisDate,
      );
      const snapshotVersion = latestDirectoryVersion + 1;
      const parentVersion = latestPublishedVersion > 0 ? latestPublishedVersion : null;
      const createdAt = this.now().toISOString();
      const gateWarnings: WarningItem[] =
        gate.dataStatus === "partial"
          ? [
              {
                code: "KLINE_COVERAGE_PARTIAL",
                message: "Snapshot published with partial Kline coverage",
                context: {
                  poolCount: digest.etfs.length,
                  klineValidCount: digest.etfs.filter(
                    (item) => item.lastDate === digest.analysisDate,
                  ).length,
                },
              },
            ]
          : [];

      activeStep = "build_snapshot";
      await this.tasks.beginStep(task.taskId, activeStep);
      const payload = await payloadFactory(snapshotVersion);
      if (fingerprintOfInputDigest(payload.inputDigest) !== inputFingerprint) {
        throw new SnapshotError({
          code: "SNAPSHOT_INVALID",
          message: "Payload input digest changed after publication planning",
        });
      }
      const built = await buildSnapshot(this.paths, this.store, payload, {
        snapshotVersion,
        taskId: task.taskId,
        createdAt,
        reason: options.reason,
        parentVersion,
        dataStatus: gate.dataStatus,
        extraWarnings: gateWarnings,
      });
      await this.tasks.finishStep(task.taskId, activeStep, {
        status: "success",
        counts: { files: built.manifest.files.length, version: snapshotVersion },
      });
      activeStep = null;

      activeStep = "validate_snapshot";
      await this.tasks.beginStep(task.taskId, activeStep);
      const validation = await verifySnapshot(this.paths, this.store, built.relativePath, {
        allowedStatuses: ["validated"],
      });
      if (!validation.valid) {
        throw new SnapshotError({
          code: "SNAPSHOT_VERIFY_FAILED",
          message: "Snapshot validation failed before publication",
          context: { issues: validation.issues },
        });
      }
      await this.tasks.finishStep(task.taskId, activeStep, {
        status: "success",
        counts: { files: built.manifest.files.length },
      });
      activeStep = null;

      activeStep = "publish_snapshot";
      await this.tasks.beginStep(task.taskId, activeStep);
      const published = await promoteBuiltSnapshot(this.paths, this.store, built, {
        publishedAt: this.now().toISOString(),
      });
      const finalVerification = await verifySnapshot(
        this.paths,
        this.store,
        published.relativePath,
        {
          allowedStatuses: ["published"],
        },
      );
      if (!finalVerification.valid) {
        throw new SnapshotError({
          code: "SNAPSHOT_VERIFY_FAILED",
          message: "Published snapshot failed post-promotion verification",
          context: { issues: finalVerification.issues },
        });
      }
      const warnings = normalizeWarnings([...(payload.warnings ?? []), ...gateWarnings]);
      await this.updateSystemState(published.manifest, warnings);
      await this.tasks.finishStep(task.taskId, activeStep, {
        status: "success",
        counts: { files: published.manifest.files.length, version: snapshotVersion },
        warnings: warnings.length,
      });
      activeStep = null;

      const taskStatus = warnings.length > 0 ? "partial_success" : "success";
      const finished = await this.tasks.finish(task.taskId, {
        status: taskStatus,
        snapshotVersion,
        inputFingerprint,
        warnings,
      });
      return {
        taskId: task.taskId,
        task: finished,
        status: taskStatus,
        analysisDate: digest.analysisDate,
        snapshotVersion,
        snapshotPath: published.relativePath,
        inputFingerprint,
        warnings,
      };
    } catch (error) {
      const taskError = taskErrorFromUnknown(error, {
        ...(activeStep === null ? {} : { step: activeStep }),
      });
      if (activeStep !== null) {
        await this.tasks
          .finishStep(task.taskId, activeStep, {
            status: "failed",
            error: taskError,
          })
          .catch(() => undefined);
      }
      await this.tasks
        .finish(task.taskId, { status: "failed", inputFingerprint, error: taskError })
        .catch(() => undefined);
      throw error;
    } finally {
      await lock?.release().catch(() => undefined);
    }
  }

  private async updateSystemState(
    manifest: SnapshotManifest,
    warnings: WarningItem[],
  ): Promise<void> {
    const updatedAt = this.now().toISOString();
    try {
      await addManifestToSnapshotIndex(this.paths, this.store, manifest, updatedAt);
    } catch {
      try {
        const rebuilt = await buildSnapshotIndex(this.paths, this.store, updatedAt);
        await writeSnapshotIndex(this.paths, this.store, rebuilt);
      } catch {
        warnings.push({
          code: "SNAPSHOT_INDEX_UPDATE_FAILED",
          message: "Snapshot was published but snapshot-index.json could not be updated",
        });
      }
    }

    try {
      await advanceCurrentPointer(this.paths, this.store, manifest, updatedAt);
    } catch {
      warnings.push({
        code: "CURRENT_UPDATE_FAILED",
        message: "Snapshot was published but current.json could not be updated",
      });
    }
  }
}
