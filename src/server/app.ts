import { readFile } from "node:fs/promises";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { logger } from "../logging.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { dateStringSchema } from "../domain/date.js";
import {
  REPORT_MODES,
  REPORT_STATUSES,
  REPORT_TYPES,
  reportModeSchema,
  reportTypeSchema,
} from "../domain/report.js";
import type { SnapshotData } from "../snapshots/snapshot-reader.js";
import { SnapshotReadError } from "../snapshots/snapshot-reader.js";
import type { EtfCode } from "../sources/types.js";
import { createAppServices, type AppServices } from "./context.js";
import { CLIENT_JS, STYLES, loadEchartsBundle } from "./assets.js";
import { etfDetail, queryEtfList, queryRanking } from "./etf-query.js";
import { ApiError, statusForError, toPublicError } from "./errors.js";
import { queryEtfHistory, HISTORY_RANGES, type HistoryRange } from "./history.js";
import { renderLayout, renderErrorState } from "./html.js";
import { RANKING_LABELS, SEVERITY_LABELS, SERVICE_VERSION } from "./labels.js";
import {
  renderAdminPage,
  renderEtfDetailPage,
  renderEtfListPage,
  renderMarketPage,
  renderOverviewPage,
  renderReportDetailPage,
  renderReportsPage,
} from "./pages.js";
import {
  invalid,
  parseDateParam,
  parseEnum,
  parseEtfCode,
  parsePageParams,
  parsePositiveInteger,
  parseRankingCode,
  parseShortText,
  parseSnapshotQuery,
  parseVersionParam,
} from "./query.js";

export type AppServicesSource = AppServices | (() => Promise<AppServices>);

export function createApp(source: AppServicesSource): Hono {
  const app = new Hono();
  const getServices = typeof source === "function" ? source : async () => source;

  app.use("*", async (context, next) => {
    context.header("X-Content-Type-Options", "nosniff");
    context.header("Referrer-Policy", "no-referrer");
    context.header("X-Frame-Options", "DENY");
    context.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    context.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    await next();
  });

  app.get("/health", (context) =>
    context.json({
      status: "ok",
      service: "maga",
      version: SERVICE_VERSION,
      time: new Date().toISOString(),
    }),
  );

  app.get("/assets/styles.css", (context) =>
    context.body(STYLES, 200, {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    }),
  );

  app.get("/assets/app.js", (context) =>
    context.body(CLIENT_JS, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    }),
  );

  app.get("/assets/echarts.min.js", async (context) => {
    const bundle = await loadEchartsBundle();
    return context.body(bundle, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    });
  });

  app.get("/api/health", async (context) => {
    const services = await getServices();
    const current = await services.snapshots.current();
    return ok(
      context,
      {
        status: "ok",
        service: "maga",
        version: SERVICE_VERSION,
        dataRoot: services.dataRoot,
        current,
        config: {
          algorithmVersion: services.config.calculation.algorithmVersion,
          ruleVersion: services.config.rules.ruleVersion,
          configHash: services.config.configHash,
        },
      },
      { generatedAt: services.now().toISOString() },
    );
  });

  app.get("/api/market/overview", async (context) => {
    const services = await getServices();
    const data = await loadSnapshot(services, new URL(context.req.url).searchParams);
    return ok(context, data.overview, snapshotMeta(services, data));
  });

  app.get("/api/market/analysis", async (context) => {
    const services = await getServices();
    const data = await loadSnapshot(services, new URL(context.req.url).searchParams);
    return ok(
      context,
      {
        returns: data.market.returns,
        trend: data.market.trend,
        risk: data.market.risk,
        activity: data.market.activity,
        valuation: data.market.valuation,
        state: data.market.state,
        findings: data.findings.market,
      },
      snapshotMeta(services, data),
    );
  });

  app.get("/api/etfs", async (context) => {
    const services = await getServices();
    const searchParams = new URL(context.req.url).searchParams;
    const data = await loadSnapshot(services, searchParams);
    const pageParams = parsePageParams(searchParams);
    const sort = parseRankingCode(
      searchParams.get("ranking") ?? searchParams.get("sort") ?? undefined,
    );
    const order = parseEnum(
      searchParams.get("order") ?? undefined,
      ["asc", "desc"] as const,
      "order",
    );
    const q = parseShortText(searchParams.get("q") ?? undefined, "q", 100);
    const category = parseShortText(searchParams.get("category") ?? undefined, "category", 50);
    const subcategory = parseShortText(
      searchParams.get("subcategory") ?? undefined,
      "subcategory",
      50,
    );
    const result = queryEtfList(data, services.config.categories, services.config.calculation, {
      ...pageParams,
      sort,
      ...(order === undefined ? {} : { order }),
      ...(q === undefined ? {} : { q }),
      ...(category === undefined ? {} : { category }),
      ...(subcategory === undefined ? {} : { subcategory }),
    });
    return ok(context, result, snapshotMeta(services, data));
  });

  app.get("/api/etfs/:code", async (context) => {
    const services = await getServices();
    const code = parseEtfCode(context.req.param("code"));
    const data = await loadSnapshot(services, new URL(context.req.url).searchParams);
    return ok(context, etfDetail(data, code), snapshotMeta(services, data));
  });

  app.get("/api/etfs/:code/history", async (context) => {
    const services = await getServices();
    const code = parseEtfCode(context.req.param("code"));
    const searchParams = new URL(context.req.url).searchParams;
    const data = await loadSnapshot(services, searchParams);
    requireEtf(data, code);
    const range =
      parseEnum(searchParams.get("range") ?? undefined, HISTORY_RANGES, "range", "1y") ?? "1y";
    const result = await queryEtfHistory({
      reader: services.snapshots,
      reference: {
        analysisDate: data.analysisDate,
        snapshotVersion: data.snapshotVersion,
        relativePath: data.relativePath,
        manifest: data.manifest,
      },
      code,
      range: range as HistoryRange,
    });
    return ok(context, result, snapshotMeta(services, data));
  });

  app.get("/api/etfs/:code/kline", async (context) => {
    const services = await getServices();
    const code = parseEtfCode(context.req.param("code"));
    const searchParams = new URL(context.req.url).searchParams;
    const data = await loadSnapshot(services, searchParams);
    requireEtf(data, code);
    const period =
      parseEnum(
        searchParams.get("period") ?? undefined,
        ["day", "week", "month"] as const,
        "period",
        "day",
      ) ?? "day";
    const limit = parsePositiveInteger(searchParams.get("limit") ?? undefined, {
      name: "limit",
      defaultValue: 250,
      minimum: 1,
      maximum: 1000,
    });
    const rows = await services.klineChart.getChart(code as EtfCode, {
      period,
      analysisDate: data.analysisDate,
      limit,
      ...(services.klineSource === null ? {} : { source: services.klineSource }),
    });
    return ok(
      context,
      {
        code,
        period,
        periodLabel: period === "day" ? "日" : period === "week" ? "周" : "月",
        analysisDate: data.analysisDate,
        snapshotVersion: data.snapshotVersion,
        adjust: 1,
        source: "chart_cache",
        rows,
      },
      snapshotMeta(services, data),
    );
  });

  app.get("/api/rankings", async (context) => {
    const services = await getServices();
    const searchParams = new URL(context.req.url).searchParams;
    const data = await loadSnapshot(services, searchParams);
    const rankingCode = parseRankingCode(searchParams.get("ranking") ?? undefined);
    const pageParams = parsePageParams(searchParams);
    const category = parseShortText(searchParams.get("category") ?? undefined, "category", 50);
    const subcategory = parseShortText(
      searchParams.get("subcategory") ?? undefined,
      "subcategory",
      50,
    );
    const result = queryRanking(
      data,
      services.config.categories,
      services.config.calculation,
      rankingCode,
      {
        ...pageParams,
        ...(category === undefined ? {} : { category }),
        ...(subcategory === undefined ? {} : { subcategory }),
      },
    );
    return ok(
      context,
      { label: RANKING_LABELS[rankingCode], ...result },
      snapshotMeta(services, data),
    );
  });

  app.get("/api/findings", async (context) => {
    const services = await getServices();
    const searchParams = new URL(context.req.url).searchParams;
    const data = await loadSnapshot(services, searchParams);
    const level = parseEnum(
      searchParams.get("level") ?? undefined,
      ["market", "etf"] as const,
      "level",
    );
    const severity = parseEnum(
      searchParams.get("severity") ?? undefined,
      ["info", "warning", "critical"] as const,
      "severity",
    );
    const code = parseShortText(searchParams.get("code") ?? undefined, "code", 40);
    const q = parseShortText(searchParams.get("q") ?? undefined, "q", 100);
    const { page, pageSize } = parsePageParams(searchParams);
    const source =
      level === "market"
        ? data.findings.market.items
        : level === "etf"
          ? data.findings.etfs.items
          : [...data.findings.market.items, ...data.findings.etfs.items];
    const filtered = source.filter(
      (finding) =>
        (severity === undefined || finding.severity === severity) &&
        (code === undefined || finding.etfCode === code) &&
        (q === undefined ||
          finding.title.toLowerCase().includes(q.toLowerCase()) ||
          finding.description.toLowerCase().includes(q.toLowerCase()) ||
          finding.ruleCode.toLowerCase().includes(q.toLowerCase())),
    );
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map((finding) => ({
      ...finding,
      severityLabel: SEVERITY_LABELS[finding.severity],
    }));
    return ok(
      context,
      { total: filtered.length, page, pageSize, items },
      snapshotMeta(services, data),
    );
  });

  app.get("/api/reports", async (context) => {
    const services = await getServices();
    const searchParams = new URL(context.req.url).searchParams;
    const { page, pageSize } = parsePageParams(searchParams);
    const reportListQuery = {
      ...optional("date", parseDateParam(searchParams.get("date") ?? undefined)),
      ...optional("version", parseVersionParam(searchParams.get("version") ?? undefined)),
      ...optional("type", parseEnum(searchParams.get("type") ?? undefined, REPORT_TYPES, "type")),
      ...optional("mode", parseEnum(searchParams.get("mode") ?? undefined, REPORT_MODES, "mode")),
      ...optional(
        "status",
        parseEnum(searchParams.get("status") ?? undefined, REPORT_STATUSES, "status"),
      ),
    };
    const items = await services.reports.list(reportListQuery);
    const start = (page - 1) * pageSize;
    return ok(
      context,
      { total: items.length, page, pageSize, items: items.slice(start, start + pageSize) },
      { generatedAt: services.now().toISOString() },
    );
  });

  app.get("/api/reports/:id", async (context) => {
    const services = await getServices();
    const id = context.req.param("id");
    if (!/^report_\d{8}_\d{3,}$/.test(id)) {
      throw invalid("Invalid report id");
    }
    const searchParams = new URL(context.req.url).searchParams;
    const date = parseDateParam(searchParams.get("date") ?? undefined);
    const report = await services.reports.find(id, date);
    if (report === null) {
      throw new ApiError("REPORT_NOT_FOUND", 404, "Report not found", { id });
    }
    return ok(context, report, {
      analysisDate: report.analysisDate,
      snapshotVersion: report.snapshotVersion,
      generatedAt: services.now().toISOString(),
    });
  });

  app.post("/api/admin/reports/generate", async (context) => {
    assertAdminAccess(context);
    const services = await getServices();
    const request = await parseGenerateReportRequest(context);
    const started = await services.reports.start({
      ...request,
      trigger: "api",
      lockMaxWaitMs: 0,
    });
    context.header("Cache-Control", "no-store");
    return context.json(
      {
        ok: true,
        data: started,
        meta: { generatedAt: services.now().toISOString() },
      },
      202,
    );
  });

  app.get("/api/snapshots", async (context) => {
    const services = await getServices();
    const searchParams = new URL(context.req.url).searchParams;
    const { page, pageSize } = parsePageParams(searchParams);
    const items = (await services.snapshots.listSnapshots()).reverse();
    const start = (page - 1) * pageSize;
    return ok(
      context,
      { total: items.length, page, pageSize, items: items.slice(start, start + pageSize) },
      { generatedAt: services.now().toISOString() },
    );
  });

  app.get("/api/snapshots/:date", async (context) => {
    const services = await getServices();
    const date = parseDateParam(context.req.param("date"));
    if (date === undefined) {
      throw invalid("date is required");
    }
    const data = await services.snapshots.load({ date });
    return ok(context, snapshotDescriptor(data), snapshotMeta(services, data));
  });

  app.get("/api/snapshots/:date/:version", async (context) => {
    const services = await getServices();
    const date = parseDateParam(context.req.param("date"));
    const version = parseVersionParam(context.req.param("version"));
    if (date === undefined || version === undefined) {
      throw invalid("date and version are required");
    }
    const data = await services.snapshots.load({ date, version });
    return ok(context, snapshotDescriptor(data), snapshotMeta(services, data));
  });

  app.get("/api/tasks", async (context) => {
    const services = await getServices();
    const { page, pageSize } = parsePageParams(new URL(context.req.url).searchParams);
    const items = (await services.tasks.list()).sort((left, right) =>
      right.requestedAt.localeCompare(left.requestedAt),
    );
    const start = (page - 1) * pageSize;
    return ok(
      context,
      { total: items.length, page, pageSize, items: items.slice(start, start + pageSize) },
      { generatedAt: services.now().toISOString() },
    );
  });

  app.get("/api/tasks/:id", async (context) => {
    const services = await getServices();
    const id = context.req.param("id");
    if (!/^task_[A-Za-z0-9_-]+$/.test(id)) {
      throw invalid("Invalid task id");
    }
    const task = await services.tasks.read(id);
    if (task === null) {
      throw new ApiError("TASK_NOT_FOUND", 404, "Task not found", { id });
    }
    return ok(context, task, { generatedAt: services.now().toISOString() });
  });

  app.get("/", async (context) =>
    context.html(
      await renderOverviewPage(await getServices(), new URL(context.req.url).searchParams),
    ),
  );

  app.get("/etfs", async (context) =>
    context.html(
      await renderEtfListPage(await getServices(), new URL(context.req.url).searchParams),
    ),
  );

  app.get("/etfs/:code", async (context) => {
    const services = await getServices();
    return context.html(
      await renderEtfDetailPage(
        services,
        context.req.param("code"),
        new URL(context.req.url).searchParams,
      ),
    );
  });

  app.get("/market", async (context) =>
    context.html(
      await renderMarketPage(await getServices(), new URL(context.req.url).searchParams),
    ),
  );

  app.get("/reports", async (context) =>
    context.html(
      await renderReportsPage(await getServices(), new URL(context.req.url).searchParams),
    ),
  );

  app.get("/reports/:id", async (context) => {
    const services = await getServices();
    return context.html(
      await renderReportDetailPage(
        services,
        context.req.param("id"),
        new URL(context.req.url).searchParams,
      ),
    );
  });

  app.get("/admin", async (context) =>
    context.html(await renderAdminPage(await getServices(), new URL(context.req.url).searchParams)),
  );

  app.notFound((context) => {
    if (new URL(context.req.url).pathname.startsWith("/api/")) {
      return context.json(
        {
          ok: false,
          error: { code: "INVALID_QUERY", message: "Unknown API route", details: {} },
        },
        404,
      );
    }
    return context.html(
      renderLayout({
        title: "页面不存在",
        active: "overview",
        children: renderErrorState("页面不存在", "请检查地址，或从导航返回市场总览。"),
      }),
      404,
    );
  });

  app.onError((error, context) => {
    const publicError = toPublicError(error);
    const status = statusForError(error) as ContentfulStatusCode;
    if (status >= 500) {
      logger.error(
        {
          event: "http_request_failed",
          method: context.req.method,
          path: new URL(context.req.url).pathname,
          code: publicError.code,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        "HTTP request failed",
      );
    }
    if (new URL(context.req.url).pathname.startsWith("/api/")) {
      context.status(status);
      context.header("Cache-Control", "no-store");
      return context.json({ ok: false, error: publicError });
    }
    context.status(status);
    return context.html(
      renderLayout({
        title: "请求失败",
        active: activeForPath(new URL(context.req.url).pathname),
        children: renderErrorState(publicError.code, publicError.message),
      }),
    );
  });

  return app;
}

async function loadSnapshot(
  services: AppServices,
  searchParams: URLSearchParams,
): Promise<SnapshotData> {
  return services.snapshots.load(parseSnapshotQuery(searchParams));
}

function requireEtf(data: SnapshotData, code: string): void {
  if (!data.features.has(code)) {
    throw new ApiError("ETF_NOT_FOUND", 404, `ETF not found in snapshot: ${code}`, { code });
  }
}

function snapshotMeta(services: AppServices, data: SnapshotData): Record<string, unknown> {
  return {
    analysisDate: data.analysisDate,
    snapshotVersion: data.snapshotVersion,
    dataStatus: data.manifest.dataStatus,
    publishedAt: data.manifest.publishedAt,
    generatedAt: services.now().toISOString(),
  };
}

function snapshotDescriptor(data: SnapshotData): Record<string, unknown> {
  return {
    analysisDate: data.analysisDate,
    snapshotVersion: data.snapshotVersion,
    relativePath: data.relativePath,
    dataStatus: data.manifest.dataStatus,
    manifest: data.manifest,
  };
}

function ok(context: Context, data: unknown, meta: Record<string, unknown>): Response {
  context.header("Cache-Control", "no-store");
  return context.json({ ok: true, data, meta });
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function assertAdminAccess(context: Context): void {
  const token = process.env.ADMIN_TOKEN;
  if (token !== undefined && token !== "") {
    const authorization = context.req.header("authorization");
    const supplied = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : context.req.header("x-admin-token");
    if (supplied !== token) {
      throw new ApiError("ADMIN_FORBIDDEN", 403, "Admin access denied");
    }
    return;
  }

  const host = process.env.HOST ?? "127.0.0.1";
  if (!isLoopbackHost(host)) {
    throw new ApiError("ADMIN_FORBIDDEN", 403, "Admin access requires ADMIN_TOKEN");
  }
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

async function parseGenerateReportRequest(context: Context): Promise<{
  date?: string;
  version?: number;
  type?: z.infer<typeof reportTypeSchema>;
  mode?: z.infer<typeof reportModeSchema>;
}> {
  const text = await context.req.text();
  if (Buffer.byteLength(text, "utf8") > 1_000_000) {
    throw invalid("Request body must not exceed 1MB");
  }
  let value: unknown = {};
  if (text.trim() !== "") {
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      throw invalid("Request body must be valid JSON");
    }
  }
  const parsed = z
    .object({
      date: dateStringSchema.optional(),
      version: z.number().int().positive().optional(),
      type: reportTypeSchema.optional(),
      mode: reportModeSchema.optional(),
    })
    .strict()
    .safeParse(value);
  if (!parsed.success) {
    throw invalid(
      "Invalid report request: " + parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  return {
    ...optional("date", parsed.data.date),
    ...optional("version", parsed.data.version),
    ...optional("type", parsed.data.type),
    ...optional("mode", parsed.data.mode),
  };
}

function activeForPath(path: string): "overview" | "etfs" | "market" | "reports" | "admin" {
  if (path.startsWith("/etfs")) return "etfs";
  if (path.startsWith("/market")) return "market";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/admin")) return "admin";
  return "overview";
}

let defaultServices: Promise<AppServices> | undefined;

function getDefaultServices(): Promise<AppServices> {
  defaultServices ??= createAppServices();
  return defaultServices;
}

export const app = createApp(getDefaultServices);
