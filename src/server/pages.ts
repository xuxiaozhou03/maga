import type { AppConfig } from "../config/loader.js";
import type { Finding } from "../domain/findings.js";
import type { EtfFeatureFile } from "../domain/features.js";
import type { Report, ReportCitation } from "../domain/report.js";
import { RANKING_CODES } from "../domain/rankings.js";
import type {
  SnapshotData,
  SnapshotReader,
  SnapshotSummary,
} from "../snapshots/snapshot-reader.js";
import { SnapshotReadError } from "../snapshots/snapshot-reader.js";
import type { TaskRecord } from "../domain/task.js";
import type { AppServices } from "./context.js";
import { etfDetail, queryEtfList, queryRanking } from "./etf-query.js";
import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatInteger,
  formatNumber,
  formatPercent,
  formatRank,
} from "./format.js";
import { queryEtfHistory } from "./history.js";
import {
  categoryLabel,
  dataStatusLabel,
  MARKET_STATE_LABELS,
  RANKING_LABELS,
  SEVERITY_LABELS,
  TASK_STATUS_LABELS,
} from "./labels.js";
import {
  chartCard,
  escapeHtml,
  renderEmptyState,
  renderLayout,
  renderPageTitle,
  renderPartialBanner,
  renderSnapshotPicker,
  renderSnapshotStrip,
  snapshotDisplayMeta,
  statCard,
} from "./html.js";
import {
  parseDateParam,
  parseEtfCode,
  parsePageParams,
  parseRankingCode,
  parseShortText,
  parseSnapshotQuery,
  parseVersionParam,
} from "./query.js";
import { ApiError, statusForError } from "./errors.js";

type ActivePage = "overview" | "etfs" | "market" | "reports" | "admin";

interface LoadedPage {
  data: SnapshotData | null;
  snapshots: SnapshotSummary[];
}

export async function renderOverviewPage(
  services: AppServices,
  searchParams: URLSearchParams,
): Promise<string> {
  const loaded = await loadPageSnapshot(services, searchParams);
  if (loaded.data === null) {
    return renderLayout({
      title: "市场总览",
      active: "overview",
      children: `${renderPageTitle({
        eyebrow: "Market Overview",
        title: "市场总览",
        description: "先看市场温度，再进入 ETF 与分类细节。所有指标均来自同一已发布快照。",
      })}${renderEmptyState(
        "还没有可用的已发布快照",
        "运行每日分析并发布快照后，这里会显示市场状态、收益分布、趋势、风险、活跃度和估值概况。",
        '<span class="mono muted">pnpm snapshot:verify --all</span>',
      )}`,
    });
  }

  const data = loaded.data;
  const meta = snapshotDisplayMeta(data);
  const state = data.market.state;
  const return20d = data.market.returns.returns["20d"];
  const ranking = data.rankings.return_20d;
  const strongest = ranking.items.slice(0, 6);
  const weakest = [...ranking.items].slice(-6).reverse();
  const topFindings = [...data.findings.market.items, ...data.findings.etfs.items]
    .sort(compareFindings)
    .slice(0, 6);
  const distribution = distributionChart(data.market.returns.returns["20d"].distribution);
  const periodChart = {
    title: "多周期收益中位数",
    subtitle: `${meta.analysisDate} · 有效样本按周期独立统计`,
    unit: "%",
    categories: ["1D", "5D", "20D", "60D", "120D", "250D", "YTD"],
    series: [
      {
        name: "中位数",
        type: "line",
        data: ["1d", "5d", "20d", "60d", "120d", "250d", "ytd"].map((period) =>
          toChartPercent(
            data.market.returns.returns[period as keyof typeof data.market.returns.returns].median,
          ),
        ),
      },
      {
        name: "上涨比例",
        type: "line",
        data: ["1d", "5d", "20d", "60d", "120d", "250d", "ytd"].map((period) =>
          toChartPercent(
            data.market.returns.returns[period as keyof typeof data.market.returns.returns]
              .positiveRatio,
          ),
        ),
      },
    ],
  };

  const body = `${renderPageTitle({
    eyebrow: "Market Overview",
    title: "市场总览",
    description: "以摘要为主：先确认样本与数据质量，再观察市场状态、收益结构和主要风险。",
  })}
  ${renderSnapshotStrip(meta)}
  ${renderPartialBanner(meta)}
  ${renderSnapshotPicker({ action: "/", meta, snapshots: loaded.snapshots })}
  <section class="stat-grid">
    ${statCard("市场状态", state.label, `规则 ${state.matchedRule}`)}
    ${statCard("20D 收益中位数", formatPercent(return20d.median), `有效样本 ${formatInteger(return20d.validCount)}`)}
    ${statCard("20D 上涨比例", formatPercent(return20d.positiveRatio), `有效样本 ${formatInteger(return20d.validCount)}`)}
    ${statCard("趋势向上比例", formatPercent(data.market.trend.trend.bullishRatio), `有效样本 ${formatInteger(data.market.trend.trend.validCount)}`)}
  </section>
  <div class="grid two">
    ${chartCard({
      title: "20D 收益分布",
      description: "横轴为收益区间，纵轴为 ETF 数量。",
      source: "快照 market/returns.json",
      chartId: "return-distribution-chart",
      chartData: distribution,
      unit: "只",
    })}
    ${chartCard({
      title: "多周期收益结构",
      description: "中位数为 0 时显示为 0.00%；缺失值不进入绘图数据。",
      source: "快照 market/returns.json",
      chartId: "return-period-chart",
      chartData: periodChart,
      unit: "%",
    })}
  </div>
  <div class="grid two">
    <section class="panel">
      <div class="panel-heading"><div><h2>市场状态与证据</h2><p>由规则阈值匹配，不做事后方向判断。</p></div><span class="pill">${escapeHtml(state.label)}</span></div>
      <div class="kv-grid">
        ${kv("1D 上涨比例", formatPercent(state.evidence.positiveRatio1d))}
        ${kv("20D 收益中位数", formatPercent(state.evidence.medianReturn20d))}
        ${kv("MA20 上方比例", formatPercent(state.evidence.aboveMa20Ratio))}
        ${kv("20D 平均波动", formatPercent(state.evidence.meanVolatility20d))}
        ${kv("20D 收益 P10", formatPercent(state.evidence.p10Return20d))}
        ${kv("20D 收益 P90", formatPercent(state.evidence.p90Return20d))}
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><h2>趋势、风险与活跃度</h2><p>各指标使用自己的有效样本分母。</p></div></div>
      <div class="kv-grid">
        ${kv("MA20 上方比例", formatPercent(data.market.trend.trend.aboveMa20Ratio))}
        ${kv("20D 平均波动", formatPercent(data.market.risk.risk.meanVolatility20d))}
        ${kv("高回撤比例", formatPercent(data.market.risk.risk.highDrawdownRatio))}
        ${kv("20D 平均量比", formatPercent(data.market.activity.activity.meanAmountRatio20d))}
        ${kv("成交放大比例", formatPercent(data.market.activity.activity.expandedRatio))}
        ${kv("估值有效 ETF", formatInteger(data.market.valuation.valuation.pe.validEtfCount))}
      </div>
    </section>
  </div>
  <div class="grid two">
    ${renderRankingPreview("相对强势", strongest, data)}
    ${renderRankingPreview("相对弱势", weakest, data)}
  </div>
  <section class="panel">
    <div class="panel-heading"><div><h2>重要发现</h2><p>规则发现按严重度与代码排序。</p></div><a href="/reports">查看研究报告</a></div>
    ${renderFindings(topFindings)}
  </section>
  ${renderPeriodReturnsTable(data)}`;

  return renderLayout({ title: "市场总览", active: "overview", children: body });
}

export async function renderEtfListPage(
  services: AppServices,
  searchParams: URLSearchParams,
): Promise<string> {
  const loaded = await loadPageSnapshot(services, searchParams);
  if (loaded.data === null) {
    return renderLayout({
      title: "ETF 全列表",
      active: "etfs",
      children: `${renderPageTitle({
        eyebrow: "Universe",
        title: "ETF 全列表",
        description: "搜索、筛选、排序与分页全部基于快照中的研究池。",
      })}${renderEmptyState(
        "研究池还没有可用快照",
        "发布首个快照后，可在这里按分类、名称和代码检索 ETF。",
      )}`,
    });
  }

  const data = loaded.data;
  const meta = snapshotDisplayMeta(data);
  const pageParams = parsePageParams(searchParams);
  const sort = parseRankingCode(
    searchParams.get("ranking") ?? searchParams.get("sort") ?? undefined,
  );
  const orderValue = searchParams.get("order");
  const order =
    orderValue === "asc" || orderValue === "desc"
      ? orderValue
      : orderValue === null || orderValue === ""
        ? undefined
        : (() => {
            throw new ApiError("INVALID_QUERY", 400, "order must be asc or desc");
          })();
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
  const selectedCategory = category ?? "";
  const actionParams: Record<string, string | number | undefined> = {
    ranking: sort,
    ...(order === undefined ? {} : { order }),
    ...(q === undefined ? {} : { q }),
    ...(category === undefined ? {} : { category }),
    ...(subcategory === undefined ? {} : { subcategory }),
    pageSize: pageParams.pageSize,
  };

  const rows = result.items
    .map((item) => {
      const rank = item.ranks[sort];
      return `<tr>
        <td>${formatRank(rank?.rank)}</td>
        <td>${formatRank(rank?.filteredRank)}</td>
        <td><a href="/etfs/${encodeURIComponent(item.code)}?date=${encodeURIComponent(meta.analysisDate)}&version=${meta.snapshotVersion}"><strong>${escapeHtml(item.name)}</strong></a><div class="mono muted">${escapeHtml(item.code)}</div></td>
        <td><span class="pill ${item.category.status}">${escapeHtml(categoryLabel(services.config.categories, item.category.primaryCode, item.category.secondaryCode))}</span></td>
        <td class="${signClass(item.returns["1d"])}">${formatPercent(item.returns["1d"])}</td>
        <td class="${signClass(item.returns["20d"])}">${formatPercent(item.returns["20d"])}</td>
        <td class="${signClass(item.returns["60d"])}">${formatPercent(item.returns["60d"])}</td>
        <td>${formatPercent(item.trend.ma20Deviation)}</td>
        <td>${formatPercent(item.risk.volatility20d)}</td>
        <td>${formatPercent(item.risk.currentDrawdown)}</td>
        <td>${formatAmount(item.activity.averageAmount20d)}</td>
        <td>${formatPercent(item.valuation.pePercentile)}</td>
      </tr>`;
    })
    .join("");
  const totalPages = Math.max(1, Math.ceil(result.filteredTotal / result.pageSize));
  const prevLink = result.page > 1 ? listPageUrl(searchParams, result.page - 1) : null;
  const nextLink = result.page < totalPages ? listPageUrl(searchParams, result.page + 1) : null;

  const body = `${renderPageTitle({
    eyebrow: "Universe",
    title: "ETF 全列表",
    description: "默认展示全研究池；全池排名来自快照，筛选集排名在读取时计算，两者不会混用。",
  })}
  ${renderSnapshotStrip(meta)}
  ${renderPartialBanner(meta)}
  ${renderSnapshotPicker({
    action: "/etfs",
    meta,
    snapshots: loaded.snapshots,
    preserve: actionParams,
  })}
  <form class="toolbar" method="get" action="/etfs">
    <input type="hidden" name="date" value="${escapeHtml(meta.analysisDate)}">
    <input type="hidden" name="version" value="${meta.snapshotVersion}">
    <label class="grow">代码 / 名称<input type="search" name="q" maxlength="100" value="${escapeHtml(q ?? "")}" placeholder="例如 510300 或 沪深300"></label>
    <label>一级分类${renderCategorySelect(services.config, category)}</label>
    <label>二级分类${renderSubcategorySelect(services.config, category, subcategory)}</label>
    <label>排序维度<select name="ranking">${RANKING_CODES.map((code) => `<option value="${code}"${sort === code ? " selected" : ""}>${RANKING_LABELS[code]}</option>`).join("")}</select></label>
    <label>方向<select name="order"><option value="">默认</option><option value="desc"${order === "desc" ? " selected" : ""}>降序</option><option value="asc"${order === "asc" ? " selected" : ""}>升序</option></select></label>
    <label>每页<select name="pageSize">${[25, 50, 100, 200].map((size) => `<option value="${size}"${size === result.pageSize ? " selected" : ""}>${size}</option>`).join("")}</select></label>
    <button class="button primary" type="submit">应用筛选</button>
  </form>
  <div class="data-table-wrap">
    <table>
      <caption>共 ${formatInteger(result.total)} 只 ETF，筛选后 ${formatInteger(result.filteredTotal)} 只 · 第 ${result.page} / ${totalPages} 页</caption>
      <thead><tr>
        <th>全池排名</th><th>筛选集排名</th><th>ETF</th><th>分类</th><th>1D</th><th>20D</th><th>60D</th><th>MA20 偏离</th><th>20D 波动</th><th>当前回撤</th><th>20D 均额</th><th>PE 百分位</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="12" class="muted">当前筛选条件没有匹配的 ETF。</td></tr>`}</tbody>
    </table>
  </div>
  <div class="pagination">
    <span>排序：${escapeHtml(RANKING_LABELS[sort])} · 缺失值显示为 “—”</span>
    <div class="links">${prevLink ? `<a class="button secondary" href="${escapeHtml(prevLink)}">上一页</a>` : ""}${nextLink ? `<a class="button secondary" href="${escapeHtml(nextLink)}">下一页</a>` : ""}</div>
  </div>`;

  return renderLayout({ title: "ETF 全列表", active: "etfs", children: body });
}

export async function renderEtfDetailPage(
  services: AppServices,
  codeParam: string,
  searchParams: URLSearchParams,
): Promise<string> {
  const code = parseEtfCode(codeParam);
  const loaded = await loadPageSnapshot(services, searchParams);
  if (loaded.data === null) {
    return renderLayout({
      title: "ETF 详情",
      active: "etfs",
      children: `${renderPageTitle({
        eyebrow: "ETF Detail",
        title: "ETF 详情",
        description: "ETF 详情仅从已发布快照读取。",
      })}${renderEmptyState("还没有可用的已发布快照", "发布快照后才能查看 ETF 详情。")}`,
    });
  }

  const data = loaded.data;
  const detail = etfDetail(data, code);
  const meta = snapshotDisplayMeta(data);
  const rankRows = RANKING_CODES.map((rankingCode) => {
    const item = detail.ranks[rankingCode];
    return `<tr><td>${escapeHtml(RANKING_LABELS[rankingCode])}</td><td>${formatRank(item?.rank)}</td><td>${formatPercent(item?.percentile)}</td></tr>`;
  }).join("");
  const quality = detail.dataQuality;
  const feature = detail.features;
  const returns = feature.returns;
  const trend = feature.trend;
  const risk = feature.risk;
  const activity = feature.activity;
  const valuation = feature.valuation;

  const quota = `${detail.name} · ${detail.code}`;
  const chartSource = `快照 ${meta.analysisDate} v${meta.snapshotVersion}`;
  const body = `${renderPageTitle({
    eyebrow: `${detail.exchange} · ${detail.code}`,
    title: detail.name,
    description: `分类：${categoryLabel(services.config.categories, detail.category.primaryCode, detail.category.secondaryCode)} · 最新 K 线：${quality.lastKlineDate ?? "—"}`,
    actions: `<a class="button secondary" href="/etfs?date=${encodeURIComponent(meta.analysisDate)}&version=${meta.snapshotVersion}">返回列表</a>`,
  })}
  ${renderSnapshotStrip(meta)}
  ${renderPartialBanner(meta)}
  ${renderSnapshotPicker({ action: `/etfs/${encodeURIComponent(code)}`, meta, snapshots: loaded.snapshots })}
  <section class="stat-grid">
    ${statCard("1D 收益", formatPercent(returns["1d"]), "收盘到收盘")}
    ${statCard("20D 收益", formatPercent(returns["20d"]), `YTD ${formatPercent(returns.ytd)}`)}
    ${statCard("20D 波动", formatPercent(risk.volatility20d), "年化")}
    ${statCard("当前回撤", formatPercent(risk.currentDrawdown), `样本高点 ${formatNumber(risk.sampleHigh, 4)}`)}
  </section>
  <div data-tabs>
    <div class="tabs" role="tablist">
      ${tabButton("overview", "综合表现", true)}
      ${tabButton("trend", "行情趋势")}
      ${tabButton("returns", "收益分析")}
      ${tabButton("risk", "风险分析")}
      ${tabButton("activity", "成交分析")}
      ${tabButton("valuation", "估值分析")}
      ${tabButton("findings", "研究发现")}
    </div>
    <section class="tab-panel" data-panel="overview">
      <div class="grid two">
        <section class="panel">
          <div class="panel-heading"><div><h2>基础信息</h2><p>分类状态与数据质量均来自当前快照。</p></div><span class="pill ${detail.category.status}">${detail.category.status === "confirmed" ? "已确认" : "待确认"}</span></div>
          <div class="kv-grid">
            ${kv("代码", detail.code)}
            ${kv("交易所", detail.exchange)}
            ${kv("分类", categoryLabel(services.config.categories, detail.category.primaryCode, detail.category.secondaryCode))}
            ${kv("K 线行数", formatInteger(quality.klineRows))}
            ${kv("首个 K 线日期", formatDate(quality.firstKlineDate))}
            ${kv("最新 K 线日期", formatDate(quality.lastKlineDate))}
            ${kv("样本有效", quality.sampleValid ? "是" : "否")}
            ${kv("20D 成交样本", formatInteger(quality.amountSampleCount20d))}
            ${kv("数据警告", quality.warnings.length === 0 ? "无" : quality.warnings.join("、"))}
          </div>
        </section>
        <section class="panel">
          <div class="panel-heading"><div><h2>收益概览</h2><p>收益率按小数转百分比展示，缺失值保持 “—”。</p></div></div>
          ${renderReturnsTable(returns)}
        </section>
      </div>
      <section class="panel section-gap">
        <div class="panel-heading"><div><h2>全池排名</h2><p>排名与百分位来自快照 rankings 文件。</p></div></div>
        <div class="data-table-wrap"><table><thead><tr><th>排名维度</th><th>排名</th><th>百分位</th></tr></thead><tbody>${rankRows}</tbody></table></div>
      </section>
    </section>
    <section class="tab-panel" data-panel="trend" hidden>
      <section class="panel">
        <div class="panel-heading"><div><h2>行情趋势</h2><p>K 线仅用于图表，不参与特征计算。补拉失败时保留空状态而不是填 0。</p></div><label>周期<select id="kline-period"><option value="day">日 K</option><option value="week">周 K</option><option value="month">月 K</option></select></label></div>
        <div class="chart tall" id="kline-chart" data-code="${escapeHtml(detail.code)}" data-date="${escapeHtml(meta.analysisDate)}" data-version="${meta.snapshotVersion}"></div>
        <div class="chart-empty" id="kline-chart-empty" hidden>暂无可绘制的 K 线数据</div>
        <p class="chart-source">数据来源：data/cache/klines（前复权）· 图表范围按接口返回日期。</p>
      </section>
      <div class="grid two">
        <section class="panel">
          <div class="panel-heading"><div><h2>均线与 BOLL</h2><p>来自快照特征，不读取 K 线缓存重算。</p></div></div>
          <div class="kv-grid">
            ${kv("收盘", formatNumber(trend.close, 4))}
            ${kv("MA5", formatNumber(trend.ma5, 4))}
            ${kv("MA10", formatNumber(trend.ma10, 4))}
            ${kv("MA20", formatNumber(trend.ma20, 4))}
            ${kv("MA60", formatNumber(trend.ma60, 4))}
            ${kv("MA120", formatNumber(trend.ma120, 4))}
            ${kv("MA20 偏离", formatPercent(trend.ma20Deviation))}
            ${kv("MA60 偏离", formatPercent(trend.ma60Deviation))}
            ${kv("均线排列", trend.maAlignment ?? "—")}
            ${kv("BOLL 中轨", formatNumber(trend.boll20.middle, 4))}
            ${kv("BOLL 上轨", formatNumber(trend.boll20.upper, 4))}
            ${kv("BOLL 下轨", formatNumber(trend.boll20.lower, 4))}
          </div>
        </section>
        <section class="panel">
          <div class="panel-heading"><div><h2>趋势位置</h2><p>布尔值缺失时显示 “—”。</p></div></div>
          <div class="kv-grid">
            ${kv("MA20 上方", formatBoolean(trend.aboveMa20))}
            ${kv("MA60 上方", formatBoolean(trend.aboveMa60))}
            ${kv("MA120 上方", formatBoolean(trend.aboveMa120))}
            ${kv("BOLL %B", formatPercent(trend.boll20.percentB))}
            ${kv("BOLL 带宽", formatPercent(trend.boll20.bandwidth))}
            ${kv("均线得分", formatInteger(trend.maAlignmentScore))}
          </div>
        </section>
      </div>
    </section>
    <section class="tab-panel" data-panel="returns" hidden>
      <div class="grid two">
        <section class="panel"><div class="panel-heading"><div><h2>多周期收益</h2><p>快照字段原样展示。</p></div></div>${renderReturnsTable(returns)}</section>
        <section class="panel"><div class="panel-heading"><div><h2>历史统计</h2><p>按 1M / 3M / 6M / YTD / 1Y / 2Y 区间。</p></div></div>${renderHistoryStats(feature.history)}</section>
      </div>
      <section class="panel section-gap">
        <div class="panel-heading"><div><h2>历史特征序列</h2><p>只读取每日已发布快照，不从 K 线缓存重算。</p></div><label>范围<select id="history-range"><option value="1m">1M</option><option value="3m">3M</option><option value="6m">6M</option><option value="1y" selected>1Y</option><option value="2y">2Y</option></select></label></div>
        <div class="chart" id="history-chart" data-code="${escapeHtml(detail.code)}" data-date="${escapeHtml(meta.analysisDate)}" data-version="${meta.snapshotVersion}"></div>
        <div class="chart-empty" id="history-chart-empty" hidden>该时间范围内没有已发布快照</div>
        <p class="chart-source">数据来源：每日快照 etfs/${escapeHtml(detail.code)}.json。</p>
      </section>
    </section>
    <section class="tab-panel" data-panel="risk" hidden>
      <div class="grid two">
        <section class="panel">
          <div class="panel-heading"><div><h2>波动与回撤</h2><p>缺失窗口返回 “—”，不以 0 替代。</p></div></div>
          <div class="kv-grid">
            ${kv("20D 波动", formatPercent(risk.volatility20d))}
            ${kv("60D 波动", formatPercent(risk.volatility60d))}
            ${kv("120D 波动", formatPercent(risk.volatility120d))}
            ${kv("20D 最大回撤", formatPercent(risk.maxDrawdown20d))}
            ${kv("60D 最大回撤", formatPercent(risk.maxDrawdown60d))}
            ${kv("120D 最大回撤", formatPercent(risk.maxDrawdown120d))}
            ${kv("250D 最大回撤", formatPercent(risk.maxDrawdown250d))}
            ${kv("当前回撤", formatPercent(risk.currentDrawdown))}
            ${kv("距离样本高点", formatPercent(risk.distanceFromSampleHigh))}
          </div>
        </section>
        <section class="panel">
          <div class="panel-heading"><div><h2>回撤窗口</h2><p>60D 回撤峰值与谷值日期来自快照。</p></div></div>
          <div class="kv-grid">
            ${kv("60D 峰值日期", formatDate(risk.maxDrawdown60dPeakDate))}
            ${kv("60D 谷值日期", formatDate(risk.maxDrawdown60dTroughDate))}
            ${kv("样本高点", formatNumber(risk.sampleHigh, 4))}
            ${kv("计算日", detail.analysisDate)}
          </div>
        </section>
      </div>
    </section>
    <section class="tab-panel" data-panel="activity" hidden>
      <section class="panel">
        <div class="panel-heading"><div><h2>成交活跃度</h2><p>成交额与量比由快照提供。</p></div></div>
        <div class="kv-grid">
          ${kv("当日成交额", formatAmount(activity.amount))}
          ${kv("5D 平均成交额", formatAmount(activity.averageAmount5d))}
          ${kv("20D 平均成交额", formatAmount(activity.averageAmount20d))}
          ${kv("60D 平均成交额", formatAmount(activity.averageAmount60d))}
          ${kv("20D 量比", formatPercent(activity.amountRatio20d))}
          ${kv("60D 量比", formatPercent(activity.amountRatio60d))}
          ${kv("20D 样本数", formatInteger(activity.amountSampleCount20d))}
          ${kv("数据状态", quality.sampleValid ? "有效样本" : "样本无效")}
        </div>
      </section>
    </section>
    <section class="tab-panel" data-panel="valuation" hidden>
      <section class="panel">
        <div class="panel-heading"><div><h2>估值位置</h2><p>百分位只表示历史位置，不构成推荐。</p></div></div>
        <div class="data-table-wrap"><table>
          <thead><tr><th>指标</th><th>当前值</th><th>历史百分位</th><th>估值日期</th><th>滞后天数</th><th>数据新鲜度</th></tr></thead>
          <tbody>${renderValuationRows(valuation)}</tbody>
        </table></div>
      </section>
    </section>
    <section class="tab-panel" data-panel="findings" hidden>
      <section class="panel"><div class="panel-heading"><div><h2>研究发现</h2><p>仅展示已写入快照的规则发现。</p></div></div>${renderFindings(detail.findings)}</section>
    </section>
  </div>`;

  return renderLayout({ title: quota, active: "etfs", children: body });
}

export async function renderMarketPage(
  services: AppServices,
  searchParams: URLSearchParams,
): Promise<string> {
  const loaded = await loadPageSnapshot(services, searchParams);
  if (loaded.data === null) {
    return renderLayout({
      title: "市场分析",
      active: "market",
      children: `${renderPageTitle({
        eyebrow: "Market Analysis",
        title: "市场分析",
        description: "收益、趋势、风险、成交与估值的分项统计。",
      })}${renderEmptyState("还没有可用的已发布快照", "发布快照后可查看市场深度分析。")}`,
    });
  }

  const data = loaded.data;
  const meta = snapshotDisplayMeta(data);
  const returns = data.market.returns;
  const trend = data.market.trend.trend;
  const risk = data.market.risk.risk;
  const activity = data.market.activity.activity;
  const valuation = data.market.valuation.valuation;
  const state = data.market.state;
  const confirmedCount = [...data.features.values()].filter(
    (feature) => feature.category.status === "confirmed",
  ).length;
  const pendingCount = data.features.size - confirmedCount;
  const body = `${renderPageTitle({
    eyebrow: "Market Analysis",
    title: "市场分析",
    description: "每个指标使用独立有效样本；分类统计仅作辅助维度，不改变全池口径。",
  })}
  ${renderSnapshotStrip(meta)}
  ${renderPartialBanner(meta)}
  ${renderSnapshotPicker({ action: "/market", meta, snapshots: loaded.snapshots })}
  <section class="stat-grid">
    ${statCard("市场状态", state.label, `匹配规则 ${state.matchedRule}`)}
    ${statCard("MA20 上方", formatPercent(trend.aboveMa20Ratio), `有效 ${formatInteger(trend.aboveMa20ValidCount)}`)}
    ${statCard("高回撤比例", formatPercent(risk.highDrawdownRatio), `有效 ${formatInteger(risk.drawdownValidCount)}`)}
    ${statCard("估值覆盖 ETF", formatInteger(valuation.pe.validEtfCount), `${formatPercent(valuation.pe.etfCoverageRatio)} 的池内 ETF`)}
  </section>
  <div class="grid two">
    ${chartCard({
      title: "20D 收益分布",
      description: "全池有效样本，不包含 null。",
      source: "快照 market/returns.json",
      chartId: "market-return-chart",
      chartData: distributionChart(returns.returns["20d"].distribution),
      unit: "只",
    })}
    ${chartCard({
      title: "趋势结构",
      description: "均线排列与 MA20/MA60 上方比例。",
      source: "快照 market/trend.json",
      chartId: "market-trend-chart",
      chartData: {
        title: "趋势结构",
        subtitle: `有效样本 ${trend.validCount}`,
        unit: "%",
        categories: ["均线多头", "均线空头", "MA20 上方", "MA60 上方"],
        series: [
          {
            name: "比例",
            data: [
              trend.bullishRatio,
              trend.bearishRatio,
              trend.aboveMa20Ratio,
              trend.aboveMa60Ratio,
            ].map(toChartPercent),
          },
        ],
      },
      unit: "%",
    })}
  </div>
  ${renderPeriodReturnsTable(data)}
  <div class="grid two">
    <section class="panel">
      <div class="panel-heading"><div><h2>风险分布</h2><p>波动、回撤与风险得分各自使用有效样本。</p></div></div>
      <div class="kv-grid">
        ${kv("平均 20D 波动", formatPercent(risk.meanVolatility20d))}
        ${kv("波动有效样本", formatInteger(risk.volatilityValidCount))}
        ${kv("高波动比例", formatPercent(risk.highVolatilityRatio))}
        ${kv("平均 60D 回撤", formatPercent(risk.meanMaxDrawdown60d))}
        ${kv("高回撤比例", formatPercent(risk.highDrawdownRatio))}
        ${kv("平均风险得分", formatPercent(risk.meanRiskScore))}
        ${kv("高风险比例", formatPercent(risk.highRiskRatio))}
        ${kv("风险有效样本", formatInteger(risk.riskScoreValidCount))}
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><h2>成交与分类辅助</h2><p>分类状态允许为 pending，且不阻断计算。</p></div></div>
      <div class="kv-grid">
        ${kv("平均 20D 量比", formatPercent(activity.meanAmountRatio20d))}
        ${kv("成交放大比例", formatPercent(activity.expandedRatio))}
        ${kv("成交有效样本", formatInteger(activity.amountValidCount))}
        ${kv("分类已确认", formatInteger(confirmedCount))}
        ${kv("分类待确认", formatInteger(pendingCount))}
        ${kv("分类映射版本", `v${services.config.categoryMapping.version}`)}
      </div>
    </section>
  </div>
  <div class="grid two">
    <section class="panel">
      <div class="panel-heading"><div><h2>估值概览</h2><p>百分位按 0–1 展示为 0%–100%。</p></div></div>
      <div class="data-table-wrap"><table>
        <thead><tr><th>指标</th><th>中位百分位</th><th>有效指数</th><th>有效 ETF</th><th>覆盖率</th><th>偏低 / 偏高</th></tr></thead>
        <tbody>${(["pe", "pb", "ps"] as const)
          .map(
            (type) =>
              `<tr><td>${type.toUpperCase()}</td><td>${formatPercent(valuation[type].medianPercentile)}</td><td>${formatInteger(valuation[type].validCount)}</td><td>${formatInteger(valuation[type].validEtfCount)}</td><td>${formatPercent(valuation[type].etfCoverageRatio)}</td><td>${formatInteger(valuation[type].lowCount)} / ${formatInteger(valuation[type].highCount)}</td></tr>`,
          )
          .join("")}</tbody>
      </table></div>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><h2>市场状态证据</h2><p>状态标签与证据均来自快照。</p></div><span class="pill">${escapeHtml(MARKET_STATE_LABELS[state.code] ?? state.label)}</span></div>
      <div class="kv-grid">
        ${kv("1D 上涨比例", formatPercent(state.evidence.positiveRatio1d))}
        ${kv("20D 收益中位数", formatPercent(state.evidence.medianReturn20d))}
        ${kv("MA20 上方", formatPercent(state.evidence.aboveMa20Ratio))}
        ${kv("20D 平均波动", formatPercent(state.evidence.meanVolatility20d))}
        ${kv("P10 / P90", `${formatPercent(state.evidence.p10Return20d)} / ${formatPercent(state.evidence.p90Return20d)}`)}
        ${kv("20D 平均量比", formatPercent(state.evidence.meanAmountRatio20d))}
      </div>
    </section>
  </div>
  <section class="panel">
    <div class="panel-heading"><div><h2>市场发现</h2><p>仅展示已发布快照中的规则发现。</p></div></div>
    ${renderFindings(data.findings.market.items)}
  </section>`;
  return renderLayout({ title: "市场分析", active: "market", children: body });
}

export async function renderReportsPage(
  services: AppServices,
  searchParams: URLSearchParams,
): Promise<string> {
  const date = parseDateParam(searchParams.get("date") ?? undefined);
  const version = parseVersionParam(searchParams.get("version") ?? undefined);
  const reports = await services.reports.list({
    ...(date === undefined ? {} : { date }),
    ...(version === undefined ? {} : { version }),
  });
  const aiCount = reports.filter((report) => report.mode === "ai").length;
  const fallbackCount = reports.filter((report) => report.fallbackFrom === "ai").length;
  const failedCount = reports.filter((report) => report.status === "failed").length;
  const rows = reports
    .map(
      (report) => `<tr>
        <td><a href="/reports/${encodeURIComponent(report.reportId)}?date=${encodeURIComponent(report.analysisDate)}&version=${report.snapshotVersion}">${escapeHtml(report.reportId)}</a></td>
        <td>${escapeHtml(report.analysisDate)}</td>
        <td>v${report.snapshotVersion}</td>
        <td>${escapeHtml(reportTypeLabel(report.type))}</td>
        <td>${escapeHtml(reportModeLabel(report.mode, report.fallbackFrom))}</td>
        <td><span class="status status-${report.status === "success" ? "complete" : "partial"}">${escapeHtml(reportStatusLabel(report.status))}</span></td>
        <td>${report.model === null ? "—" : `${escapeHtml(report.model.provider)} / ${escapeHtml(report.model.name)}`}</td>
        <td>${escapeHtml(formatDateTime(report.generatedAt))}</td>
      </tr>`,
    )
    .join("");
  const body = `${renderPageTitle({
    eyebrow: "Research Reports",
    title: "研究报告",
    description: "报告是已发布快照的解释层；模板报告可离线生成，AI 报告必须通过快照引用校验。",
    actions: '<a class="button secondary" href="/admin">查看系统状态</a>',
  })}
  <form class="snapshot-picker" method="get" action="/reports">
    <label>分析日期
      <input type="date" name="date" value="${escapeHtml(date ?? "")}">
    </label>
    <label>快照版本
      <input type="number" name="version" min="1" step="1" value="${version === undefined ? "" : version}">
    </label>
    <button type="submit" class="button secondary">筛选报告</button>
    <span class="form-hint">留空时显示全部报告。</span>
  </form>
  <section class="stat-grid">
    ${statCard("报告总数", formatInteger(reports.length), "按生成时间倒序")}
    ${statCard("AI 报告", formatInteger(aiCount), "通过引用校验")}
    ${statCard("模板回退", formatInteger(fallbackCount), "AI 失败不影响快照")}
    ${statCard("失败报告", formatInteger(failedCount), "基础快照保持不变")}
  </section>
  <section class="panel">
    <div class="panel-heading"><div><h2>报告列表</h2><p>同一快照版本可保留多份报告，以 reportId 区分。</p></div></div>
    <div class="data-table-wrap"><table><thead><tr><th>报告 ID</th><th>分析日期</th><th>快照版本</th><th>类型</th><th>模式</th><th>状态</th><th>模型</th><th>生成时间</th></tr></thead><tbody>${rows || `<tr><td colspan="8" class="muted">暂无报告。运行 <span class="mono">pnpm report:generate</span> 生成模板报告。</td></tr>`}</tbody></table></div>
  </section>`;
  return renderLayout({ title: "研究报告", active: "reports", children: body });
}

export async function renderReportDetailPage(
  services: AppServices,
  reportId: string,
  searchParams: URLSearchParams,
): Promise<string> {
  if (!/^report_\d{8}_\d{3,}$/.test(reportId)) {
    throw new ApiError("REPORT_NOT_FOUND", 404, "Report not found", { id: reportId });
  }
  const date = parseDateParam(searchParams.get("date") ?? undefined);
  const report = await services.reports.find(reportId, date);
  if (report === null) {
    throw new ApiError("REPORT_NOT_FOUND", 404, "Report not found", { id: reportId });
  }

  const modeNotice =
    report.mode === "ai"
      ? `<div class="notice"><strong>AI 生成</strong><span>${escapeHtml(report.model?.provider ?? "—")} / ${escapeHtml(report.model?.name ?? "—")}，Prompt ${escapeHtml(report.model?.promptVersion ?? "—")}</span></div>`
      : report.fallbackFrom === "ai"
        ? `<div class="partial-banner" role="status"><strong>模板回退</strong><span>AI 报告生成失败，已保留失败原因并生成模板报告；快照与 current 未改变。</span></div>`
        : '<div class="notice"><strong>模板生成</strong><span>确定性、离线生成，不调用外部模型。</span></div>';
  const errorNotice =
    report.error === null
      ? ""
      : `<section class="error-state compact"><span class="eyebrow">${escapeHtml(report.error.code)}</span><h2>报告降级原因</h2><p>${escapeHtml(report.error.message)}</p><p>可重试：${report.error.retryable ? "是" : "否"}</p></section>`;

  const sections = report.content.sections
    .map(
      (section) => `<article class="panel report-section">
        <h2>${escapeHtml(section.heading)}</h2>
        <p>${escapeHtml(section.body)}</p>
        <div class="citation-list">
          <span>引用来源</span>
          <ul>${section.citations
            .map(
              (citation) =>
                `<li><a href="${escapeHtml(reportCitationHref(report, citation))}">${escapeHtml(citation.path)}#${escapeHtml(citation.field)}</a></li>`,
            )
            .join("")}</ul>
        </div>
      </article>`,
    )
    .join("");
  const findings =
    report.content.keyFindings.length === 0
      ? ""
      : `<section class="panel"><div class="panel-heading"><div><h2>关键发现</h2><p>来自已发布快照的规则发现。</p></div></div><ul class="finding-list">${report.content.keyFindings
          .map(
            (finding) =>
              `<li><span class="mono">${escapeHtml(finding.ruleCode)}</span><span>${escapeHtml(finding.text)}</span></li>`,
          )
          .join("")}</ul></section>`;
  const citations =
    report.citations.length === 0
      ? ""
      : `<section class="panel"><div class="panel-heading"><div><h2>引用汇总</h2><p>所有引用均通过 JSON Pointer 存在于对应已发布快照。</p></div></div><ul class="citation-list plain">${report.citations
          .map(
            (citation) =>
              `<li><a href="${escapeHtml(reportCitationHref(report, citation))}">${escapeHtml(citation.path)}#${escapeHtml(citation.field)}</a></li>`,
          )
          .join("")}</ul></section>`;

  const body = `${renderPageTitle({
    eyebrow: "Research Report",
    title: report.content.title,
    description: report.content.summary,
    actions: '<a class="button secondary" href="/reports">返回报告列表</a>',
  })}
  <section class="snapshot-strip" aria-label="报告信息">
    <div><span>分析日期</span><strong>${escapeHtml(report.analysisDate)}</strong></div>
    <div><span>快照版本</span><strong>v${report.snapshotVersion}</strong></div>
    <div><span>报告类型</span><strong>${escapeHtml(reportTypeLabel(report.type))}</strong></div>
    <div><span>生成模式</span><strong>${escapeHtml(reportModeLabel(report.mode, report.fallbackFrom))}</strong></div>
    <div><span>生成时间</span><strong>${escapeHtml(formatDateTime(report.generatedAt))}</strong></div>
    <div><span>引用数</span><strong>${formatInteger(report.citations.length)}</strong></div>
  </section>
  ${modeNotice}
  ${errorNotice}
  ${sections || renderEmptyState("报告没有可用正文", "报告生成失败或正文为空；基础快照不受影响。")}
  ${findings}
  ${citations}`;
  return renderLayout({ title: report.content.title, active: "reports", children: body });
}

export async function renderAdminPage(
  services: AppServices,
  searchParams: URLSearchParams,
): Promise<string> {
  const loaded = await loadPageSnapshot(services, searchParams);
  const tasks = (await services.tasks.list()).sort((left, right) =>
    right.requestedAt.localeCompare(left.requestedAt),
  );
  const snapshotRows = [...loaded.snapshots]
    .reverse()
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.analysisDate)}</td>
        <td>v${item.snapshotVersion}</td>
        <td><span class="status status-${item.dataStatus}">${escapeHtml(dataStatusLabel(item.dataStatus))}</span></td>
        <td>${escapeHtml(formatDateTime(item.publishedAt))}</td>
        <td class="mono">${escapeHtml(item.inputFingerprint.slice(0, 20))}…</td>
      </tr>`,
    )
    .join("");
  const taskRows = tasks
    .slice(0, 50)
    .map(
      (task) => `<tr>
        <td class="mono">${escapeHtml(task.taskId)}</td>
        <td>${escapeHtml(task.type)}</td>
        <td>${escapeHtml(TASK_STATUS_LABELS[task.status])}</td>
        <td>${escapeHtml(task.analysisDate)}</td>
        <td>${escapeHtml(formatDateTime(task.requestedAt))}</td>
        <td>${formatInteger(task.steps.length)}</td>
        <td>${task.error ? escapeHtml(task.error.message) : "—"}</td>
      </tr>`,
    )
    .join("");
  const mappingConfirmed = services.config.categoryMapping.items.filter(
    (item) => item.status === "confirmed",
  ).length;
  const mappingPending = services.config.categoryMapping.items.filter(
    (item) => item.status === "pending",
  ).length;
  const meta = loaded.data === null ? null : snapshotDisplayMeta(loaded.data);
  const qualityPanel =
    meta === null
      ? renderEmptyState("当前没有可用快照", "任务、历史快照与配置仍可查看。")
      : `<section class="stat-grid">
          ${statCard("研究池", formatInteger(meta.etfCount), "只 ETF")}
          ${statCard("K 线有效样本", `${formatInteger(meta.klineValidCount)} / ${formatInteger(meta.etfCount)}`, formatPercent(meta.etfCount ? meta.klineValidCount / meta.etfCount : null))}
          ${statCard("估值覆盖", `${formatInteger(meta.valuationValidEtfCount)} / ${formatInteger(meta.etfCount)}`, formatPercent(meta.etfCount ? meta.valuationValidEtfCount / meta.etfCount : null))}
          ${statCard("快照警告", formatInteger(meta.warnings), "warning 条目")}
        </section>
        ${renderPartialBanner(meta)}`;
  const body = `${renderPageTitle({
    eyebrow: "Operations",
    title: "系统管理",
    description: "只读查看配置版本、快照、数据质量与任务状态。修改配置使用文件与 CLI。",
  })}
  <section class="notice">数据目录：<span class="mono">${escapeHtml(services.dataRoot)}</span> · 当前配置哈希：<span class="mono">${escapeHtml(services.config.configHash.slice(0, 20))}…</span></section>
  <div class="section-gap"></div>
  ${qualityPanel}
  <div class="grid three section-gap">
    <section class="panel"><div class="panel-heading"><div><h2>配置版本</h2><p>所有运行配置在启动时校验。</p></div></div>
      <div class="kv-grid">
        ${kv("算法版本", services.config.calculation.algorithmVersion)}
        ${kv("规则版本", services.config.rules.ruleVersion)}
        ${kv("分类版本", `v${services.config.categories.version}`)}
        ${kv("映射版本", `v${services.config.categoryMapping.version}`)}
        ${kv("已确认映射", formatInteger(mappingConfirmed))}
        ${kv("待确认映射", formatInteger(mappingPending))}
      </div>
    </section>
    <section class="panel"><div class="panel-heading"><div><h2>数据状态</h2><p>页面读取快照时执行 schema、checksum 与完整性校验。</p></div></div>
      <div class="kv-grid">
        ${kv("快照可读", meta === null ? "否" : "是")}
        ${kv("最新 K 线日期", formatDate(meta?.lastKlineDate))}
        ${kv("数据状态", meta === null ? "—" : dataStatusLabel(meta.dataStatus))}
        ${kv("快照版本", meta === null ? "—" : `v${meta.snapshotVersion}`)}
      </div>
    </section>
    <section class="panel"><div class="panel-heading"><div><h2>分类提示</h2><p>阶段 12 进行人工映射确认。</p></div></div>
      <div class="notice">允许保留显式 pending。pending 不阻塞特征、排名、市场统计与快照发布。</div>
    </section>
  </div>
  <section class="panel">
    <div class="panel-heading"><div><h2>历史快照</h2><p>已发布版本不可覆盖；修正必须发布新版本。</p></div></div>
    <div class="data-table-wrap"><table><thead><tr><th>日期</th><th>版本</th><th>数据状态</th><th>发布时间</th><th>输入指纹</th></tr></thead><tbody>${snapshotRows || `<tr><td colspan="5" class="muted">暂无已发布快照。</td></tr>`}</tbody></table></div>
  </section>
  <section class="panel">
    <div class="panel-heading"><div><h2>计算任务</h2><p>最近 50 条任务记录。</p></div></div>
    <div class="data-table-wrap"><table><thead><tr><th>任务 ID</th><th>类型</th><th>状态</th><th>分析日</th><th>请求时间</th><th>步骤数</th><th>错误</th></tr></thead><tbody>${taskRows || `<tr><td colspan="7" class="muted">暂无任务记录。</td></tr>`}</tbody></table></div>
  </section>
  <section class="panel">
    <div class="panel-heading"><div><h2>规则配置</h2><p>只读视图；修改请编辑配置文件并通过 CLI 运行。</p></div></div>
    <div class="data-table-wrap"><table><thead><tr><th>规则代码</th><th>级别</th><th>启用</th><th>严重度</th><th>单规则上限</th><th>说明</th></tr></thead><tbody>${services.config.rules.rules
      .map(
        (rule) =>
          `<tr><td class="mono">${escapeHtml(rule.code)}</td><td>${escapeHtml(rule.level)}</td><td>${rule.enabled ? "是" : "否"}</td><td>${escapeHtml(SEVERITY_LABELS[rule.severity])}</td><td>${formatInteger(rule.maxFindings)}</td><td>${escapeHtml(rule.description)}</td></tr>`,
      )
      .join("")}</tbody></table></div>
  </section>`;
  return renderLayout({ title: "系统管理", active: "admin", children: body });
}

function reportTypeLabel(type: Report["type"]): string {
  const labels: Record<Report["type"], string> = {
    daily_market_report: "每日市场报告",
    etf_deep_dive: "ETF 深度分析",
    market_anomaly: "市场异动",
    risk_note: "风险提示",
    valuation_note: "估值观察",
  };
  return labels[type];
}

function reportStatusLabel(status: Report["status"]): string {
  return status === "success" ? "成功" : "失败";
}

function reportModeLabel(mode: Report["mode"], fallbackFrom: Report["fallbackFrom"]): string {
  if (mode === "ai") {
    return "AI 生成";
  }
  return fallbackFrom === "ai" ? "模板回退" : "模板生成";
}

function reportCitationHref(report: Report, citation: ReportCitation): string {
  const query = new URLSearchParams({
    date: report.analysisDate,
    version: String(report.snapshotVersion),
  });
  if (citation.path.startsWith("etfs/")) {
    const code = citation.path.slice("etfs/".length, -".json".length);
    return `/etfs/${encodeURIComponent(code)}?${query.toString()}`;
  }
  if (citation.path.startsWith("rankings/")) {
    const ranking = citation.path.slice("rankings/".length, -".json".length);
    query.set("ranking", ranking);
    return `/etfs?${query.toString()}`;
  }
  if (citation.path.startsWith("market/") || citation.path.startsWith("findings/")) {
    return `/market?${query.toString()}`;
  }
  return `/admin?${query.toString()}`;
}

async function loadPageSnapshot(
  services: AppServices,
  searchParams: URLSearchParams,
): Promise<LoadedPage> {
  const snapshots = await services.snapshots.listSnapshots();
  const query = parseSnapshotQuery(searchParams);
  const explicitSelection = query.date !== undefined || query.version !== undefined;
  if (snapshots.length === 0) {
    if (!explicitSelection) {
      return { data: null, snapshots };
    }
    throw new SnapshotReadError("SNAPSHOT_NOT_FOUND", "No published snapshot is available");
  }

  try {
    const data = await services.snapshots.load(query);
    return { data, snapshots };
  } catch (error) {
    if (
      error instanceof SnapshotReadError &&
      error.code === "SNAPSHOT_NOT_FOUND" &&
      !explicitSelection
    ) {
      const latest = snapshots.at(-1);
      if (latest !== undefined) {
        const data = await services.snapshots.load({
          date: latest.analysisDate,
          version: latest.snapshotVersion,
        });
        return { data, snapshots };
      }
    }
    throw error;
  }
}

function kv(label: string, value: string): string {
  return `<div class="kv"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function tabButton(code: string, label: string, selected = false): string {
  return `<button type="button" class="tab-button" role="tab" data-tab="${escapeHtml(code)}" aria-selected="${selected}">${escapeHtml(label)}</button>`;
}

function formatBoolean(value: boolean | null | undefined): string {
  return value === null || value === undefined ? "—" : value ? "是" : "否";
}

function signClass(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) {
    return "";
  }
  return value > 0 ? "positive" : "negative";
}

function toChartPercent(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value * 10_000) / 100;
}

function distributionChart(bins: ReadonlyArray<{ lower: number; upper: number; count: number }>): {
  title: string;
  subtitle: string;
  unit: string;
  categories: string[];
  series: Array<{ name: string; data: number[] }>;
} {
  return {
    title: "收益分布",
    subtitle: "闭开区间按快照统计口径展示",
    unit: "只",
    categories: bins.map(
      (bin) => `${formatNumber(bin.lower * 100, 1)}% ~ ${formatNumber(bin.upper * 100, 1)}%`,
    ),
    series: [{ name: "ETF 数量", data: bins.map((bin) => bin.count) }],
  };
}

function compareFindings(left: Finding, right: Finding): number {
  const severity = { critical: 0, warning: 1, info: 2 } as const;
  const severityResult = severity[left.severity] - severity[right.severity];
  if (severityResult !== 0) {
    return severityResult;
  }
  const ruleResult = left.ruleCode.localeCompare(right.ruleCode);
  return ruleResult !== 0 ? ruleResult : left.id.localeCompare(right.id);
}

function renderFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) {
    return '<div class="notice">当前快照没有规则发现。</div>';
  }
  return `<div class="finding-list">${findings
    .map(
      (finding) => `<article class="finding ${finding.severity}">
        <div class="inline-list"><span class="pill">${escapeHtml(SEVERITY_LABELS[finding.severity])}</span><span class="pill mono">${escapeHtml(finding.ruleCode)}</span>${finding.etfCode ? `<span class="pill">${escapeHtml(finding.etfCode)}</span>` : ""}</div>
        <h3>${escapeHtml(finding.title)}</h3>
        <p>${escapeHtml(finding.description)}</p>
      </article>`,
    )
    .join("")}</div>`;
}

function renderRankingPreview(
  title: string,
  items: ReadonlyArray<{ code: string; rank: number; percentile: number }>,
  data: SnapshotData,
): string {
  const rows = items
    .map((item) => {
      const feature = data.features.get(item.code);
      return `<tr>
        <td>${formatRank(item.rank)}</td>
        <td><a href="/etfs/${encodeURIComponent(item.code)}?date=${encodeURIComponent(data.analysisDate)}&version=${data.snapshotVersion}">${escapeHtml(feature?.name ?? item.code)}</a><div class="mono muted">${escapeHtml(item.code)}</div></td>
        <td>${formatPercent(feature?.features.returns["20d"])}</td>
        <td>${formatPercent(item.percentile)}</td>
      </tr>`;
    })
    .join("");
  return `<section class="panel">
    <div class="panel-heading"><div><h2>${escapeHtml(title)}</h2><p>按 20D 收益排名；不代表投资建议。</p></div></div>
    <div class="data-table-wrap"><table><thead><tr><th>排名</th><th>ETF</th><th>20D 收益</th><th>百分位</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="muted">当前排名样本不足。</td></tr>`}</tbody></table></div>
  </section>`;
}

function renderPeriodReturnsTable(data: SnapshotData): string {
  const periods = ["1d", "5d", "20d", "60d", "120d", "250d", "ytd"] as const;
  const rows = periods
    .map((period) => {
      const stats = data.market.returns.returns[period];
      return `<tr><td>${period === "ytd" ? "YTD" : period.toUpperCase()}</td><td>${formatPercent(stats.mean)}</td><td>${formatPercent(stats.median)}</td><td>${formatPercent(stats.positiveRatio)}</td><td>${formatInteger(stats.validCount)}</td><td>${formatInteger(stats.upCount)} / ${formatInteger(stats.downCount)}</td></tr>`;
    })
    .join("");
  return `<section class="panel">
    <div class="panel-heading"><div><h2>多周期收益统计</h2><p>均值、中位数、上涨比例与有效样本均按周期独立计算。</p></div></div>
    <div class="data-table-wrap"><table><thead><tr><th>周期</th><th>均值</th><th>中位数</th><th>上涨比例</th><th>有效样本</th><th>上涨 / 下跌</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

function renderReturnsTable(returns: EtfFeatureFile["features"]["returns"]): string {
  const periods = ["1d", "5d", "20d", "60d", "120d", "250d", "ytd"] as const;
  const rows = periods
    .map(
      (period) =>
        `<tr><td>${period === "ytd" ? "YTD" : period.toUpperCase()}</td><td class="${signClass(returns[period])}">${formatPercent(returns[period])}</td></tr>`,
    )
    .join("");
  return `<div class="data-table-wrap"><table><thead><tr><th>周期</th><th>收益</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderHistoryStats(history: EtfFeatureFile["features"]["history"]): string {
  const periods = ["1m", "3m", "6m", "ytd", "1y", "2y"] as const;
  const rows = periods
    .map((period) => {
      const stats = history[period];
      return `<tr>
        <td>${period === "ytd" ? "YTD" : period.toUpperCase()}</td>
        <td>${formatInteger(stats?.tradingDays)}</td>
        <td>${formatPercent(stats?.totalReturn)}</td>
        <td>${formatPercent(stats?.annualizedReturn)}</td>
        <td>${formatPercent(stats?.annualizedVolatility)}</td>
        <td>${formatPercent(stats?.maxDrawdown)}</td>
        <td>${formatNumber(stats?.sharpe)}</td>
      </tr>`;
    })
    .join("");
  return `<div class="data-table-wrap"><table><thead><tr><th>区间</th><th>交易日</th><th>累计收益</th><th>年化收益</th><th>年化波动</th><th>最大回撤</th><th>Sharpe</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderValuationRows(valuation: EtfFeatureFile["features"]["valuation"]): string {
  const labels = { pe: "PE", pb: "PB", ps: "PS" } as const;
  const freshness = { fresh: "新鲜", stale: "滞后", too_stale: "过度滞后" } as const;
  return (["pe", "pb", "ps"] as const)
    .map((type) => {
      const item = valuation[type];
      return `<tr>
        <td>${labels[type]}</td>
        <td>${formatNumber(item?.value)}</td>
        <td>${formatPercent(item?.historicalPercentile)}</td>
        <td>${formatDate(item?.date)}</td>
        <td>${formatInteger(item?.lagDays)}</td>
        <td>${item === null ? "—" : escapeHtml(freshness[item.freshness])}</td>
      </tr>`;
    })
    .join("");
}

function renderCategorySelect(config: AppConfig, selected: string | undefined): string {
  return `<select name="category">
    <option value="">全部</option>
    <option value="confirmed"${selected === "confirmed" ? " selected" : ""}>仅已确认</option>
    <option value="pending"${selected === "pending" ? " selected" : ""}>仅待确认</option>
    ${config.categories.categories
      .map(
        (category) =>
          `<option value="${escapeHtml(category.code)}"${selected === category.code ? " selected" : ""}>${escapeHtml(category.name)}</option>`,
      )
      .join("")}
  </select>`;
}

function renderSubcategorySelect(
  config: AppConfig,
  category: string | undefined,
  selected: string | undefined,
): string {
  const groups = config.categories.categories
    .filter(
      (group) =>
        category === undefined ||
        category === "" ||
        category === "confirmed" ||
        category === "pending" ||
        group.code === category,
    )
    .map(
      (group) =>
        `<optgroup label="${escapeHtml(group.name)}">${group.children
          .map(
            (child) =>
              `<option value="${escapeHtml(child.code)}"${selected === child.code ? " selected" : ""}>${escapeHtml(child.name)}</option>`,
          )
          .join("")}</optgroup>`,
    )
    .join("");
  return `<select name="subcategory"><option value="">全部</option>${groups}</select>`;
}

function listPageUrl(searchParams: URLSearchParams, page: number): string {
  const next = new URLSearchParams(searchParams);
  next.set("page", String(page));
  return `/etfs?${next.toString()}`;
}
