import type { SnapshotData, SnapshotSummary } from "../snapshots/snapshot-reader.js";
import { formatDate, formatInteger, formatPercent } from "./format.js";
import { dataStatusLabel, SERVICE_VERSION } from "./labels.js";

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export interface LayoutOptions {
  title: string;
  active: "overview" | "etfs" | "market" | "reports" | "admin";
  children: string;
  status?: number;
}

const NAV_ITEMS = [
  ["overview", "/", "市场总览"],
  ["etfs", "/etfs", "ETF 全列表"],
  ["market", "/market", "市场分析"],
  ["reports", "/reports", "研究报告"],
  ["admin", "/admin", "系统管理"],
] as const;

export function renderLayout(options: LayoutOptions): string {
  const nav = NAV_ITEMS.map(
    ([key, href, label]) =>
      `<a href="${href}"${options.active === key ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`,
  ).join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(options.title)} · ETF 市场分析系统</title>
  <link rel="stylesheet" href="/assets/styles.css">
  <script defer src="/assets/echarts.min.js"></script>
  <script defer src="/assets/app.js"></script>
</head>
<body>
  <header class="site-header">
    <div class="brand">
      <a href="/" class="brand-mark">MAGA</a>
      <div>
        <strong>ETF 市场分析系统</strong>
        <span>只读快照 · v${SERVICE_VERSION}</span>
      </div>
    </div>
    <nav class="main-nav">${nav}</nav>
  </header>
  <main class="page-shell">${options.children}</main>
  <footer class="site-footer">
    <span>数据来自已发布快照，不使用页面请求重算业务指标。</span>
    <span>ETF 市场分析系统 V${SERVICE_VERSION}</span>
  </footer>
</body>
</html>`;
}

export interface SnapshotDisplayMeta {
  analysisDate: string;
  snapshotVersion: number;
  dataStatus: "complete" | "partial";
  publishedAt: string | null;
  etfCount: number;
  klineValidCount: number;
  valuationValidEtfCount: number;
  lastKlineDate: string | null;
  warnings: number;
}

export function snapshotDisplayMeta(data: SnapshotData): SnapshotDisplayMeta {
  return {
    analysisDate: data.analysisDate,
    snapshotVersion: data.snapshotVersion,
    dataStatus: data.manifest.dataStatus,
    publishedAt: data.manifest.publishedAt,
    etfCount: data.manifest.etfCount,
    klineValidCount: data.manifest.klineValidCount,
    valuationValidEtfCount: data.manifest.valuationValidEtfCount,
    lastKlineDate: data.manifest.sourceAsOf.klineLastDate,
    warnings: data.manifest.warnings.length,
  };
}

export function renderSnapshotStrip(meta: SnapshotDisplayMeta): string {
  const valuationCoverage =
    meta.etfCount === 0 ? null : meta.valuationValidEtfCount / meta.etfCount;
  const sampleCoverage = meta.etfCount === 0 ? null : meta.klineValidCount / meta.etfCount;
  return `<section class="snapshot-strip" aria-label="快照信息">
    <div><span>分析日期</span><strong>${escapeHtml(meta.analysisDate)}</strong></div>
    <div><span>快照版本</span><strong>v${meta.snapshotVersion}</strong></div>
    <div><span>数据状态</span><strong class="status status-${meta.dataStatus}">${escapeHtml(dataStatusLabel(meta.dataStatus))}</strong></div>
    <div><span>最新 K 线</span><strong>${escapeHtml(formatDate(meta.lastKlineDate))}</strong></div>
    <div><span>有效样本</span><strong>${formatInteger(meta.klineValidCount)} / ${formatInteger(meta.etfCount)}</strong><small>${formatPercent(sampleCoverage)}</small></div>
    <div><span>估值覆盖</span><strong>${formatInteger(meta.valuationValidEtfCount)} / ${formatInteger(meta.etfCount)}</strong><small>${formatPercent(valuationCoverage)}</small></div>
  </section>`;
}

export function renderPartialBanner(meta: SnapshotDisplayMeta): string {
  if (meta.dataStatus !== "partial") {
    return "";
  }
  return `<div class="partial-banner" role="status">
    <strong>部分数据</strong>
    <span>当前快照包含 ${formatInteger(meta.warnings)} 条数据质量警告；相关缺失值保持为 “—” 。</span>
  </div>`;
}

export function renderSnapshotPicker(input: {
  action: string;
  meta: SnapshotDisplayMeta;
  snapshots: readonly SnapshotSummary[];
  preserve?: Record<string, string | number | undefined>;
}): string {
  const dates = [...new Set(input.snapshots.map((item) => item.analysisDate))];
  const hidden = Object.entries(input.preserve ?? {})
    .filter(([, value]) => value !== undefined && value !== "")
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join("");
  return `<form class="snapshot-picker" method="get" action="${escapeHtml(input.action)}">
    ${hidden}
    <label>分析日期
      <input type="date" name="date" value="${escapeHtml(input.meta.analysisDate)}" list="snapshot-date-options">
    </label>
    <datalist id="snapshot-date-options">${dates
      .map((date) => `<option value="${escapeHtml(date)}"></option>`)
      .join("")}</datalist>
    <label>版本
      <input type="number" name="version" min="1" step="1" value="${input.meta.snapshotVersion}">
    </label>
    <button type="submit" class="button secondary">切换快照</button>
    <span class="form-hint">留空版本时使用该日期最新已发布版本。</span>
  </form>`;
}

export function renderEmptyState(title: string, description: string, action = ""): string {
  return `<section class="empty-state">
    <div class="empty-mark">∅</div>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(description)}</p>
    ${action}
  </section>`;
}

export function renderErrorState(title: string, message: string): string {
  return `<section class="error-state">
    <span class="eyebrow">请求未完成</span>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <a class="button secondary" href="/">返回市场总览</a>
  </section>`;
}

export function renderPageTitle(input: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: string;
}): string {
  return `<section class="page-heading">
    <div>
      <span class="eyebrow">${escapeHtml(input.eyebrow)}</span>
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.description)}</p>
    </div>
    ${input.actions ?? ""}
  </section>`;
}

export function statCard(label: string, value: string, note = ""): string {
  return `<article class="stat-card">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    ${note ? `<small>${escapeHtml(note)}</small>` : ""}
  </article>`;
}

export function chartCard(input: {
  title: string;
  description: string;
  source: string;
  chartId: string;
  chartData?: unknown;
  unit: string;
}): string {
  return `<section class="panel chart-panel">
    <div class="panel-heading">
      <div><h2>${escapeHtml(input.title)}</h2><p>${escapeHtml(input.description)}</p></div>
      <span class="unit">${escapeHtml(input.unit)}</span>
    </div>
    <div class="chart" id="${escapeHtml(input.chartId)}" data-chart="${escapeHtml(input.chartId)}-data"></div>
    <div class="chart-empty" id="${escapeHtml(input.chartId)}-empty" hidden>暂无可绘制的数据</div>
    ${
      input.chartData === undefined
        ? ""
        : `<script type="application/json" id="${escapeHtml(input.chartId)}-data">${jsonForScript(input.chartData)}</script>`
    }
    <p class="chart-source">数据来源：${escapeHtml(input.source)}</p>
  </section>`;
}
