import { isRealDate } from "../domain/date.js";
import {
  reportIndexSchema,
  reportSchema,
  reportSummaryOf,
  type Report,
  type ReportIndex,
  type ReportMode,
  type ReportStatus,
  type ReportSummary,
  type ReportType,
} from "../domain/report.js";
import type { DataPaths } from "../storage/data-paths.js";
import type { JsonStore } from "../storage/json-store.js";
import { ReportServiceError } from "./errors.js";

export interface ReportListQuery {
  date?: string;
  version?: number;
  type?: ReportType;
  mode?: ReportMode;
  status?: ReportStatus;
}

export class ReportRepository {
  constructor(
    private readonly paths: DataPaths,
    private readonly store: JsonStore,
  ) {}

  async list(query: ReportListQuery = {}): Promise<ReportSummary[]> {
    const dates =
      query.date === undefined
        ? (await this.listDates()).filter((date) => isRealDate(date))
        : [query.date];
    const reports: Report[] = [];
    for (const date of dates) {
      for (const name of await this.store.list(this.paths.reportDirectory(date))) {
        if (!/^report_\d{8}_\d{3,}\.json$/.test(name)) {
          continue;
        }
        const reportId = name.slice(0, -5);
        const report = await this.read(date, reportId);
        if (report !== null) {
          reports.push(report);
        }
      }
    }

    return reports
      .filter((report) => query.version === undefined || report.snapshotVersion === query.version)
      .filter((report) => query.type === undefined || report.type === query.type)
      .filter((report) => query.mode === undefined || report.mode === query.mode)
      .filter((report) => query.status === undefined || report.status === query.status)
      .map(reportSummaryOf)
      .sort(
        (left, right) =>
          right.generatedAt.localeCompare(left.generatedAt) ||
          right.reportId.localeCompare(left.reportId),
      );
  }

  async listDates(): Promise<string[]> {
    return (await this.store.list("reports"))
      .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name) && isRealDate(name))
      .sort();
  }

  async read(analysisDate: string, reportId: string): Promise<Report | null> {
    try {
      return await this.store.read(this.paths.reportFile(analysisDate, reportId), reportSchema);
    } catch (error) {
      throw new ReportServiceError({
        code: "REPORT_INDEX_CORRUPT",
        message: `Report file is invalid: ${analysisDate}/${reportId}`,
        context: { analysisDate, reportId },
        cause: error,
      });
    }
  }

  async find(reportId: string, analysisDate?: string): Promise<Report | null> {
    if (analysisDate !== undefined) {
      return this.read(analysisDate, reportId);
    }
    const dateFromId = reportId.slice("report_".length, "report_".length + 8);
    if (/^\d{8}$/.test(dateFromId)) {
      const candidate = `${dateFromId.slice(0, 4)}-${dateFromId.slice(4, 6)}-${dateFromId.slice(6, 8)}`;
      if (isRealDate(candidate)) {
        const report = await this.read(candidate, reportId);
        if (report !== null) {
          return report;
        }
      }
    }
    for (const date of await this.listDates()) {
      const report = await this.read(date, reportId);
      if (report !== null) {
        return report;
      }
    }
    return null;
  }

  async nextReportId(analysisDate: string): Promise<string> {
    const prefix = `report_${analysisDate.replaceAll("-", "")}_`;
    let maximum = 0;
    for (const name of await this.store.list(this.paths.reportDirectory(analysisDate))) {
      if (!name.startsWith(prefix) || !name.endsWith(".json")) {
        continue;
      }
      const suffix = name.slice(prefix.length, -".json".length);
      if (/^\d{3,}$/.test(suffix)) {
        maximum = Math.max(maximum, Number(suffix));
      }
    }
    return `${prefix}${String(maximum + 1).padStart(3, "0")}`;
  }

  async write(report: Report): Promise<void> {
    try {
      await this.store.writeAtomic(
        this.paths.reportFile(report.analysisDate, report.reportId),
        report,
        reportSchema,
        { overwrite: false },
      );
    } catch (error) {
      throw new ReportServiceError({
        code: "REPORT_WRITE_FAILED",
        message: `Failed to write report: ${report.reportId}`,
        retryable: true,
        context: { reportId: report.reportId },
        cause: error,
      });
    }
  }

  async readIndex(analysisDate: string): Promise<ReportIndex | null> {
    try {
      return await this.store.read(this.paths.reportIndexFile(analysisDate), reportIndexSchema);
    } catch (error) {
      throw new ReportServiceError({
        code: "REPORT_INDEX_CORRUPT",
        message: `Report index is invalid: ${analysisDate}`,
        context: { analysisDate },
        cause: error,
      });
    }
  }

  async rebuildIndex(analysisDate: string, updatedAt: string): Promise<ReportIndex> {
    const reports = await this.list({ date: analysisDate });
    const index = reportIndexSchema.parse({
      schemaVersion: 1,
      analysisDate,
      updatedAt,
      reports,
    });
    await this.writeIndex(index);
    return index;
  }

  async appendToIndex(report: Report, updatedAt: string): Promise<ReportIndex> {
    let reports: ReportSummary[];
    try {
      const current = await this.readIndex(report.analysisDate);
      reports = current?.reports ?? (await this.list({ date: report.analysisDate }));
    } catch {
      reports = await this.list({ date: report.analysisDate });
    }
    const summary = reportSummaryOf(report);
    const merged = [...reports.filter((item) => item.reportId !== summary.reportId), summary].sort(
      (left, right) =>
        right.generatedAt.localeCompare(left.generatedAt) ||
        right.reportId.localeCompare(left.reportId),
    );
    const index = reportIndexSchema.parse({
      schemaVersion: 1,
      analysisDate: report.analysisDate,
      updatedAt,
      reports: merged,
    });
    await this.writeIndex(index);
    return index;
  }

  async writeIndex(index: ReportIndex): Promise<void> {
    try {
      await this.store.writeAtomic(
        this.paths.reportIndexFile(index.analysisDate),
        index,
        reportIndexSchema,
      );
    } catch (error) {
      throw new ReportServiceError({
        code: "REPORT_WRITE_FAILED",
        message: `Failed to update report index: ${index.analysisDate}`,
        retryable: true,
        context: { analysisDate: index.analysisDate },
        cause: error,
      });
    }
  }
}
