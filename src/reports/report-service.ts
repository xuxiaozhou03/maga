import { z } from "zod";
import type {
  Report,
  ReportContent,
  ReportError,
  ReportMode,
  ReportModel,
  ReportType,
} from "../domain/report.js";
import { reportContentSchema, reportSchema, reportSummaryOf } from "../domain/report.js";
import type { TaskRecord } from "../domain/task.js";
import type { WarningItem } from "../domain/warnings.js";
import type { SnapshotData, SnapshotReader } from "../snapshots/snapshot-reader.js";
import { checksumJson } from "../storage/checksum.js";
import type { DataPaths } from "../storage/data-paths.js";
import type { JsonStore } from "../storage/json-store.js";
import type { LockHandle, LockManager } from "../storage/lock-manager.js";
import { TaskService, taskErrorFromUnknown } from "../tasks/task-service.js";
import type { ReportAiProvider } from "./ai-provider.js";
import { uniqueCitations, verifyCitations } from "./citations.js";
import { buildReportContext, type ReportContext } from "./context.js";
import {
  ReportServiceError,
  isReportServiceError,
  reportErrorMessage,
  type ReportErrorCode,
} from "./errors.js";
import type { ReportListQuery } from "./repository.js";
import { ReportRepository } from "./repository.js";
import { buildTemplateReport } from "./template-report.js";

export interface GenerateReportInput {
  date?: string;
  version?: number;
  type?: ReportType;
  mode?: ReportMode;
  trigger?: string;
  lockMaxWaitMs?: number;
}

export interface GenerateReportResult {
  task: TaskRecord;
  report: Report;
  fallback: boolean;
}

export interface StartReportResult {
  taskId: string;
  analysisDate: string;
  snapshotVersion: number;
}

export interface ReportServiceDependencies {
  now?: () => Date;
  aiProvider?: ReportAiProvider | null;
  aiTimeoutMs?: number;
  repository?: ReportRepository;
}

interface ReportDraft {
  mode: ReportMode;
  model: ReportModel | null;
  fallbackFrom: "ai" | null;
  content: ReportContent;
  citations: Report["citations"];
  error: ReportError | null;
  warnings: WarningItem[];
  fallback: boolean;
}

export class ReportService {
  private readonly now: () => Date;
  private readonly aiProvider: ReportAiProvider | null;
  private readonly aiTimeoutMs: number;
  private readonly repository: ReportRepository;

  constructor(
    private readonly paths: DataPaths,
    private readonly store: JsonStore,
    private readonly snapshots: SnapshotReader,
    private readonly tasks: TaskService,
    private readonly locks: LockManager,
    dependencies: ReportServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.aiProvider = dependencies.aiProvider ?? null;
    this.aiTimeoutMs = dependencies.aiTimeoutMs ?? 60_000;
    this.repository = dependencies.repository ?? new ReportRepository(paths, store);
  }

  async list(query: ReportListQuery = {}) {
    return this.repository.list(query);
  }

  async find(reportId: string, analysisDate?: string): Promise<Report | null> {
    return this.repository.find(reportId, analysisDate);
  }

  async generate(input: GenerateReportInput = {}): Promise<GenerateReportResult> {
    const snapshot = await this.snapshots.load(snapshotQuery(input));
    const task = await this.createTask(snapshot, input);
    let lock: LockHandle | null = null;
    try {
      lock = await this.locks.acquire(
        reportLockName(snapshot.analysisDate, snapshot.snapshotVersion),
        { taskId: task.taskId, reason: "generate_report" },
        { maxWaitMs: input.lockMaxWaitMs ?? 60_000 },
      );
    } catch (error) {
      await this.tasks
        .finish(task.taskId, {
          status: "failed",
          snapshotVersion: snapshot.snapshotVersion,
          error: taskErrorFromUnknown(error),
        })
        .catch(() => undefined);
      throw error;
    }
    return this.execute(task, snapshot, input, lock);
  }

  async start(input: GenerateReportInput = {}): Promise<StartReportResult> {
    const snapshot = await this.snapshots.load(snapshotQuery(input));
    const task = await this.createTask(snapshot, input);
    let lock: LockHandle;
    try {
      lock = await this.locks.acquire(
        reportLockName(snapshot.analysisDate, snapshot.snapshotVersion),
        { taskId: task.taskId, reason: "generate_report" },
        { maxWaitMs: input.lockMaxWaitMs ?? 0 },
      );
    } catch (error) {
      await this.tasks
        .finish(task.taskId, {
          status: "failed",
          snapshotVersion: snapshot.snapshotVersion,
          error: taskErrorFromUnknown(error),
        })
        .catch(() => undefined);
      throw error;
    }
    void this.execute(task, snapshot, input, lock).catch(() => undefined);
    return {
      taskId: task.taskId,
      analysisDate: snapshot.analysisDate,
      snapshotVersion: snapshot.snapshotVersion,
    };
  }

  private async createTask(
    snapshot: SnapshotData,
    input: GenerateReportInput,
  ): Promise<TaskRecord> {
    return this.tasks.create({
      type: "report",
      analysisDate: snapshot.analysisDate,
      trigger: input.trigger ?? "cli",
      reason: input.type ?? "daily_market_report",
    });
  }

  private async execute(
    task: TaskRecord,
    snapshot: SnapshotData,
    input: GenerateReportInput,
    lock: LockHandle,
  ): Promise<GenerateReportResult> {
    const step = "generate_report";
    let stepStarted = false;
    try {
      await this.tasks.start(task.taskId);
      await this.tasks.beginStep(task.taskId, step);
      stepStarted = true;

      const generated = await this.generateWithLock(task, snapshot, input);
      const stepError =
        generated.report.status === "failed"
          ? taskErrorFromUnknown(
              new ReportServiceError({
                code:
                  (generated.report.error?.code as ReportErrorCode | undefined) ??
                  "REPORT_TEMPLATE_FAILED",
                message: generated.report.error?.message ?? "Template report generation failed",
                retryable: generated.report.error?.retryable ?? false,
              }),
              { step },
            )
          : null;
      await this.tasks.finishStep(task.taskId, step, {
        status: generated.report.status === "failed" ? "failed" : "success",
        counts: {
          reports: 1,
          citations: generated.report.citations.length,
        },
        warnings: generated.warnings.length,
        error: stepError,
      });
      stepStarted = false;
      const finished = await this.tasks.finish(task.taskId, {
        status:
          generated.report.status === "failed"
            ? "failed"
            : generated.warnings.length > 0
              ? "partial_success"
              : "success",
        snapshotVersion: snapshot.snapshotVersion,
        inputFingerprint: generated.report.inputFingerprint,
        warnings: generated.warnings,
        error: stepError,
      });
      return { task: finished, report: generated.report, fallback: generated.fallback };
    } catch (error) {
      const taskError = taskErrorFromUnknown(error, { step });
      if (stepStarted) {
        await this.tasks
          .finishStep(task.taskId, step, { status: "failed", error: taskError })
          .catch(() => undefined);
      }
      await this.tasks
        .finish(task.taskId, {
          status: "failed",
          snapshotVersion: snapshot.snapshotVersion,
          error: taskError,
        })
        .catch(() => undefined);
      throw error;
    } finally {
      await lock.release().catch(() => undefined);
    }
  }

  private async generateWithLock(
    task: TaskRecord,
    snapshot: SnapshotData,
    input: GenerateReportInput,
  ): Promise<{
    report: Report;
    warnings: WarningItem[];
    fallback: boolean;
  }> {
    const context = buildReportContext(snapshot);
    await this.store.writeAtomic(
      this.paths.taskTempFile(task.taskId, "report-context.json"),
      context,
      z.unknown(),
    );

    const requestedType = input.type ?? "daily_market_report";
    const requestedMode = input.mode ?? "template";
    const inputFingerprint = checksumJson({
      analysisDate: snapshot.analysisDate,
      snapshotVersion: snapshot.snapshotVersion,
      snapshotInputFingerprint: snapshot.manifest.inputFingerprint,
      reportType: requestedType,
      requestedMode,
      promptVersion: this.aiProvider?.promptVersion ?? "report-v1",
      context,
    });
    let draft: ReportDraft;
    try {
      draft =
        requestedMode === "ai"
          ? await this.generateAiOrTemplate(task, snapshot, context)
          : await this.generateTemplate(snapshot, context);
    } catch (error) {
      draft = failedDraft(context, toReportError(error), requestedMode === "ai");
    }

    const idLock = await this.locks.acquire(
      `report-index-${snapshot.analysisDate}.lock`,
      { taskId: task.taskId, reason: "allocate_report_id" },
      { maxWaitMs: 60_000 },
    );
    try {
      const reportId = await this.repository.nextReportId(snapshot.analysisDate);
      const generatedAt = this.now().toISOString();
      const report = reportSchema.parse({
        schemaVersion: 1,
        reportId,
        analysisDate: snapshot.analysisDate,
        snapshotVersion: snapshot.snapshotVersion,
        type: requestedType,
        mode: draft.mode,
        status: draft.content.sections.length === 0 ? "failed" : "success",
        model: draft.model,
        fallbackFrom: draft.fallbackFrom,
        generatedAt,
        inputFingerprint,
        content: draft.content,
        citations: draft.citations,
        error: draft.error,
      });

      await this.repository.write(report);
      const warnings = [...draft.warnings];
      try {
        await this.repository.appendToIndex(report, generatedAt);
      } catch {
        try {
          await this.repository.rebuildIndex(report.analysisDate, generatedAt);
        } catch {
          warnings.push({
            code: "REPORT_INDEX_UPDATE_FAILED",
            message: "Report was written but report index could not be updated",
            context: { reportId: report.reportId },
          });
        }
      }

      if (report.status === "failed") {
        warnings.push({
          code: "REPORT_GENERATION_FAILED",
          message: report.error?.message ?? "Report generation failed",
          context: { reportId: report.reportId },
        });
      }

      return {
        report,
        warnings: dedupeWarnings(warnings),
        fallback: draft.fallback,
      };
    } finally {
      await idLock.release().catch(() => undefined);
    }
  }

  private async generateTemplate(
    snapshot: SnapshotData,
    context: ReportContext,
  ): Promise<ReportDraft> {
    const template = buildTemplateReport(context);
    await verifyCitations(template.citations, this.paths, snapshot);
    return {
      mode: "template",
      model: null,
      fallbackFrom: null,
      content: template.content,
      citations: template.citations,
      error: null,
      warnings: [],
      fallback: false,
    };
  }

  private async generateAiOrTemplate(
    task: TaskRecord,
    snapshot: SnapshotData,
    context: ReportContext,
  ): Promise<ReportDraft> {
    if (this.aiProvider === null) {
      return this.templateFallback(
        snapshot,
        context,
        new ReportServiceError({
          code: "REPORT_AI_UNAVAILABLE",
          message: "AI report provider is not configured",
          retryable: false,
        }),
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const raw = await this.aiProvider.generate({
          context,
          citationPaths: snapshot.manifest.files.map((file) => file.path),
          promptVersion: this.aiProvider.promptVersion,
          timeoutMs: this.aiTimeoutMs,
        });
        const content = parseAiContent(raw);
        for (const section of content.sections) {
          if (section.citations.length === 0) {
            throw new ReportServiceError({
              code: "REPORT_CITATION_INVALID",
              message: `AI report section has no citations: ${section.heading}`,
              retryable: true,
            });
          }
        }
        const citations = uniqueCitations(content.sections.flatMap((section) => section.citations));
        await verifyCitations(citations, this.paths, snapshot);
        return {
          mode: "ai",
          model: {
            provider: this.aiProvider.provider,
            name: this.aiProvider.model,
            promptVersion: this.aiProvider.promptVersion,
          },
          fallbackFrom: null,
          content,
          citations,
          error: null,
          warnings: [],
          fallback: false,
        };
      } catch (error) {
        lastError = error;
      }
    }

    const error =
      lastError instanceof ReportServiceError
        ? lastError
        : new ReportServiceError({
            code: "REPORT_AI_FAILED",
            message: reportErrorMessage(lastError),
            retryable: true,
            cause: lastError,
          });
    await this.store.writeAtomic(
      this.paths.taskTempFile(task.taskId, "report-ai-error.json"),
      {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        context: error.context,
      },
      z.unknown(),
    );
    return this.templateFallback(snapshot, context, error);
  }

  private async templateFallback(
    snapshot: SnapshotData,
    context: ReportContext,
    aiError: ReportServiceError,
  ): Promise<ReportDraft> {
    const template = await this.generateTemplate(snapshot, context);
    return {
      ...template,
      fallbackFrom: "ai",
      error: {
        code: aiError.code,
        message: aiError.message,
        retryable: aiError.retryable,
      },
      warnings: [
        {
          code: "REPORT_AI_FALLBACK",
          message: `AI report generation failed; template report was generated instead: ${aiError.code}`,
        },
      ],
      fallback: true,
    };
  }
}

function snapshotQuery(input: GenerateReportInput): { date?: string; version?: number } {
  return {
    ...(input.date === undefined ? {} : { date: input.date }),
    ...(input.version === undefined ? {} : { version: input.version }),
  };
}

function reportLockName(analysisDate: string, snapshotVersion: number): string {
  return `report-${analysisDate}-${snapshotVersion}.lock`;
}

function parseAiContent(raw: unknown): ReportContent {
  const candidate =
    raw !== null && typeof raw === "object" && "content" in raw
      ? (raw as { content?: unknown }).content
      : raw;
  const parsed = reportContentSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ReportServiceError({
      code: "REPORT_AI_SCHEMA_INVALID",
      message: "AI report content failed schema validation",
      retryable: true,
      context: { issues: parsed.error.issues.map((issue) => issue.message) },
    });
  }
  return parsed.data;
}

function toReportError(error: unknown): ReportError {
  if (isReportServiceError(error)) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  return {
    code: "REPORT_TEMPLATE_FAILED",
    message: reportErrorMessage(error),
    retryable: false,
  };
}

function failedDraft(
  context: ReportContext,
  error: ReportError,
  fallbackFromAi: boolean,
): ReportDraft {
  return {
    mode: "template",
    model: null,
    fallbackFrom: fallbackFromAi ? "ai" : null,
    content: {
      title: `${context.analysisDate} ETF 市场观察`,
      summary: "报告生成失败；基础快照与 current 未受影响。",
      sections: [],
      keyFindings: [],
    },
    citations: [],
    error,
    warnings: [],
    fallback: false,
  };
}

function dedupeWarnings(warnings: readonly WarningItem[]): WarningItem[] {
  const unique = new Map<string, WarningItem>();
  for (const warning of warnings) {
    unique.set(`${warning.code}\u0000${warning.message}`, warning);
  }
  return [...unique.values()].sort((left, right) =>
    `${left.code}\u0000${left.message}`.localeCompare(`${right.code}\u0000${right.message}`),
  );
}

export function reportSummary(report: Report) {
  return reportSummaryOf(report);
}
