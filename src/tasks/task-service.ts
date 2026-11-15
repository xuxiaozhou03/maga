import { randomBytes } from "node:crypto";
import {
  taskRecordSchema,
  type TaskError,
  type TaskRecord,
  type TaskStatus,
  type TaskType,
  type StepStatus,
} from "../domain/task.js";
import { warningItemSchema, type WarningItem } from "../domain/warnings.js";
import type { DataPaths } from "../storage/data-paths.js";
import { JsonStore } from "../storage/json-store.js";

export interface CreateTaskInput {
  type: TaskType;
  analysisDate: string;
  trigger: string;
  reason?: string | null;
  taskId?: string;
}

export interface FinishTaskInput {
  status: TaskStatus;
  snapshotVersion?: number | null;
  inputFingerprint?: string | null;
  warnings?: readonly WarningItem[];
  error?: TaskError | null;
}

export interface FinishStepInput {
  status: StepStatus;
  counts?: Record<string, number>;
  warnings?: number;
  error?: TaskError | null;
}

export interface TaskServiceDependencies {
  now?: () => Date;
  randomSuffix?: () => string;
}

export class TaskService {
  private readonly now: () => Date;
  private readonly randomSuffix: () => string;

  constructor(
    private readonly paths: DataPaths,
    private readonly store: JsonStore,
    dependencies: TaskServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.randomSuffix = dependencies.randomSuffix ?? (() => randomBytes(3).toString("hex"));
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    const now = this.now().toISOString();
    const taskId = input.taskId ?? this.createTaskId(input.analysisDate, this.now());
    const task = taskRecordSchema.parse({
      schemaVersion: 1,
      taskId,
      type: input.type,
      status: "pending",
      analysisDate: input.analysisDate,
      trigger: input.trigger,
      reason: input.reason ?? null,
      requestedAt: now,
      startedAt: null,
      finishedAt: null,
      steps: [],
      snapshotVersion: null,
      inputFingerprint: null,
      warnings: [],
      error: null,
    });

    await this.store.writeAtomic(this.paths.taskFile(taskId), task, taskRecordSchema, {
      overwrite: false,
    });
    return task;
  }

  async start(taskId: string): Promise<TaskRecord> {
    const now = this.now().toISOString();
    return this.update(taskId, (task) => ({
      ...task,
      status: "running",
      startedAt: task.startedAt ?? now,
    }));
  }

  async beginStep(taskId: string, name: string): Promise<TaskRecord> {
    const now = this.now().toISOString();
    return this.update(taskId, (task) => {
      if (task.steps.some((step) => step.name === name && step.status !== "pending")) {
        throw new Error(`Task step already started: ${name}`);
      }
      return {
        ...task,
        steps: [
          ...task.steps,
          {
            name,
            status: "running",
            startedAt: now,
            finishedAt: null,
            counts: {},
            warnings: 0,
            error: null,
          },
        ],
      };
    });
  }

  async finishStep(taskId: string, name: string, result: FinishStepInput): Promise<TaskRecord> {
    const now = this.now().toISOString();
    return this.update(taskId, (task) => {
      let found = false;
      const steps = task.steps.map((step) => {
        if (step.name !== name || found) {
          return step;
        }
        found = true;
        return {
          ...step,
          status: result.status,
          finishedAt: now,
          counts: result.counts ?? step.counts,
          warnings: result.warnings ?? step.warnings,
          error: result.error ?? null,
        };
      });
      if (!found) {
        throw new Error(`Task step not found: ${name}`);
      }
      return { ...task, steps };
    });
  }

  async addWarning(taskId: string, warning: WarningItem): Promise<TaskRecord> {
    const parsed = warningItemSchema.parse(warning);
    return this.update(taskId, (task) => {
      if (
        task.warnings.some((item) => item.code === parsed.code && item.message === parsed.message)
      ) {
        return task;
      }
      return { ...task, warnings: [...task.warnings, parsed] };
    });
  }

  async finish(taskId: string, input: FinishTaskInput): Promise<TaskRecord> {
    const now = this.now().toISOString();
    return this.update(taskId, (task) => ({
      ...task,
      status: input.status,
      finishedAt: now,
      snapshotVersion: input.snapshotVersion ?? task.snapshotVersion,
      inputFingerprint: input.inputFingerprint ?? task.inputFingerprint,
      warnings: input.warnings === undefined ? task.warnings : [...input.warnings],
      error: input.error ?? null,
    }));
  }

  async read(taskId: string): Promise<TaskRecord | null> {
    return this.store.read(this.paths.taskFile(taskId), taskRecordSchema);
  }

  async list(): Promise<TaskRecord[]> {
    const names = await this.store.list("system/tasks");
    const tasks: TaskRecord[] = [];
    for (const name of names.filter((value) => /^task_.+\.json$/.test(value))) {
      const task = await this.store.read(`system/tasks/${name}`, taskRecordSchema);
      if (task !== null) {
        tasks.push(task);
      }
    }
    return tasks.sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));
  }

  private async update(
    taskId: string,
    updater: (task: TaskRecord) => TaskRecord,
  ): Promise<TaskRecord> {
    return this.store.updateAtomic(this.paths.taskFile(taskId), taskRecordSchema, (current) => {
      if (current === null) {
        throw new Error(`Task not found: ${taskId}`);
      }
      return taskRecordSchema.parse(updater(current));
    });
  }

  private createTaskId(analysisDate: string, now: Date): string {
    const timestamp = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    const suffix = this.randomSuffix();
    if (!/^[a-f0-9]{6}$/.test(suffix)) {
      throw new Error("randomSuffix must return six lowercase hexadecimal characters");
    }
    return `task_${analysisDate}_${timestamp}_${suffix}`;
  }
}

export function taskErrorFromUnknown(
  error: unknown,
  options: { step?: string; code?: string; retryable?: boolean } = {},
): TaskError {
  return {
    code: options.code ?? (getErrorCode(error) || "TASK_FAILED"),
    message: error instanceof Error ? error.message : String(error),
    ...(options.step === undefined ? {} : { step: options.step }),
    retryable: options.retryable ?? false,
  };
}

function getErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}
