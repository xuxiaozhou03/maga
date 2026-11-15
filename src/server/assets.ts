import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

export const STYLES = `:root {
  --bg: #f4f1ea;
  --paper: #fffdf8;
  --ink: #17201f;
  --muted: #66706d;
  --line: #d8d5cc;
  --accent: #0f766e;
  --accent-soft: #dff2ed;
  --amber: #a16207;
  --amber-soft: #fef3c7;
  --danger: #b42318;
  --danger-soft: #fee4e2;
  --shadow: 0 12px 32px rgba(37, 45, 42, 0.07);
  --radius: 14px;
}
* { box-sizing: border-box; }
html { background: var(--bg); color: var(--ink); font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }
body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
button, input, select { font: inherit; }
button { cursor: pointer; }
.site-header { display: flex; align-items: center; justify-content: space-between; gap: 32px; padding: 18px clamp(20px, 4vw, 56px); background: rgba(255, 253, 248, 0.96); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 20; backdrop-filter: blur(10px); }
.brand { display: flex; align-items: center; gap: 14px; min-width: 220px; }
.brand-mark { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: var(--ink); color: var(--paper); font-weight: 800; letter-spacing: .08em; text-decoration: none; }
.brand strong, .brand span { display: block; }
.brand strong { font-size: 15px; }
.brand span { color: var(--muted); font-size: 12px; margin-top: 2px; }
.main-nav { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.main-nav a { padding: 9px 13px; border-radius: 999px; color: var(--muted); font-size: 14px; font-weight: 600; text-decoration: none; }
.main-nav a:hover { color: var(--ink); background: #efede6; }
.main-nav a[aria-current="page"] { color: var(--paper); background: var(--ink); }
.page-shell { width: min(1480px, 100%); margin: 0 auto; padding: 32px clamp(20px, 4vw, 56px) 56px; flex: 1; }
.site-footer { display: flex; justify-content: space-between; gap: 20px; padding: 20px clamp(20px, 4vw, 56px); border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.page-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.page-heading h1 { font-family: Georgia, "Songti SC", serif; font-size: clamp(34px, 5vw, 60px); line-height: 1.02; letter-spacing: -.035em; margin: 8px 0 10px; max-width: 900px; }
.page-heading p { color: var(--muted); margin: 0; max-width: 760px; line-height: 1.7; }
.eyebrow { color: var(--accent); font-size: 12px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
.snapshot-strip { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; margin-bottom: 18px; }
.snapshot-strip > div { background: var(--paper); padding: 14px 16px; min-height: 86px; }
.snapshot-strip span, .snapshot-strip small { display: block; color: var(--muted); font-size: 11px; }
.snapshot-strip strong { display: block; margin-top: 5px; font-size: 17px; }
.snapshot-strip small { margin-top: 3px; }
.status { display: inline-flex; width: fit-content; padding: 3px 8px; border-radius: 999px; font-size: 13px !important; }
.status-complete { color: #067647; background: #dcfae6; }
.status-partial { color: var(--amber); background: var(--amber-soft); }
.partial-banner { display: flex; gap: 12px; align-items: center; padding: 12px 16px; border: 1px solid #f1ce70; border-radius: 12px; background: var(--amber-soft); color: #713f12; margin-bottom: 20px; font-size: 14px; }
.snapshot-picker { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; padding: 14px 16px; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); margin-bottom: 24px; box-shadow: var(--shadow); }
.snapshot-picker label { display: grid; gap: 6px; color: var(--muted); font-size: 12px; font-weight: 700; }
input, select { min-height: 40px; border: 1px solid var(--line); border-radius: 9px; padding: 8px 11px; background: #fff; color: var(--ink); }
input:focus, select:focus { outline: 3px solid rgba(15, 118, 110, .18); border-color: var(--accent); }
.button { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 9px 16px; border: 1px solid transparent; border-radius: 9px; font-weight: 700; text-decoration: none; }
.button.primary { background: var(--ink); color: var(--paper); }
.button.secondary { background: #f1efe8; color: var(--ink); border-color: var(--line); }
.button:hover { text-decoration: none; filter: brightness(.97); }
.form-hint { color: var(--muted); font-size: 12px; align-self: center; }
.grid { display: grid; gap: 18px; }
.grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
.stat-card { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; box-shadow: var(--shadow); }
.stat-card span, .stat-card small { display: block; color: var(--muted); font-size: 12px; }
.stat-card strong { display: block; margin: 7px 0 4px; font-size: clamp(24px, 3vw, 36px); letter-spacing: -.03em; }
.panel { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); margin-bottom: 20px; }
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.panel-heading h2, .panel h2 { margin: 0 0 5px; font-size: 17px; }
.panel-heading p, .panel > p { margin: 0; color: var(--muted); line-height: 1.6; font-size: 13px; }
.unit { padding: 3px 8px; border-radius: 999px; background: #efede6; color: var(--muted); font-size: 11px; white-space: nowrap; }
.chart { width: 100%; height: 330px; }
.chart.tall { height: 430px; }
.chart-empty { display: grid; place-items: center; min-height: 180px; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); background: #fbfaf6; }
.chart-source { margin-top: 10px !important; font-size: 11px !important; color: var(--muted); }
.data-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
caption { text-align: left; padding: 14px 16px; font-weight: 700; border-bottom: 1px solid var(--line); }
th, td { padding: 10px 12px; border-bottom: 1px solid #ebe8df; text-align: right; white-space: nowrap; }
th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
thead th { background: #f6f3ec; color: var(--muted); font-size: 11px; letter-spacing: .02em; font-weight: 800; }
tbody tr:hover { background: #fbfaf5; }
tbody tr:last-child td { border-bottom: 0; }
.positive { color: #067647; }
.negative { color: var(--danger); }
.muted { color: var(--muted); }
.pill { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px; background: #efede6; color: var(--muted); font-size: 11px; white-space: nowrap; }
.pill.pending { background: var(--amber-soft); color: var(--amber); }
.pill.confirmed { background: var(--accent-soft); color: var(--accent); }
.toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; padding: 14px 16px; margin-bottom: 16px; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); }
.toolbar label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; font-weight: 700; }
.toolbar .grow { flex: 1 1 220px; }
.toolbar input, .toolbar select { width: 100%; }
.pagination { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 14px; color: var(--muted); font-size: 13px; }
.pagination .links { display: flex; gap: 8px; }
.empty-state, .error-state { display: grid; place-items: center; text-align: center; padding: clamp(40px, 9vw, 96px) 24px; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
.empty-mark { width: 70px; height: 70px; border: 1px dashed var(--line); border-radius: 50%; display: grid; place-items: center; color: var(--muted); font-size: 28px; margin-bottom: 12px; }
.empty-state h2, .error-state h1 { margin: 8px 0; }
.empty-state p, .error-state p { margin: 0 0 18px; color: var(--muted); max-width: 620px; line-height: 1.7; }
.error-state { border-color: #f4b7b1; background: #fffbfa; }
.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 18px 0; }
.tab-button { border: 1px solid var(--line); background: #f4f1ea; color: var(--muted); border-radius: 999px; padding: 8px 12px; font-size: 13px; font-weight: 700; }
.tab-button[aria-selected="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.tab-panel[hidden] { display: none; }
.kv-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.kv { background: #fff; padding: 12px 14px; }
.kv span { display: block; color: var(--muted); font-size: 11px; }
.kv strong { display: block; margin-top: 4px; font-size: 14px; }
.notice { padding: 12px 14px; border-radius: 10px; background: var(--accent-soft); color: #115e59; font-size: 13px; line-height: 1.6; }
.finding-list { display: grid; gap: 10px; }
.finding { padding: 14px 16px; background: #fff; border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 10px; }
.finding.warning { border-left-color: var(--amber); }
.finding.critical { border-left-color: var(--danger); }
.finding h3 { margin: 0 0 6px; font-size: 14px; }
.finding p { margin: 0; color: var(--muted); line-height: 1.6; font-size: 13px; }
.inline-list { display: flex; flex-wrap: wrap; gap: 6px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.section-gap { margin-top: 24px; }
.report-section { margin-bottom: 18px; }
.report-section h2 { margin-top: 0; }
.report-section > p { color: #35413f; line-height: 1.85; margin-bottom: 16px; }
.citation-list { border-top: 1px solid #ebe8df; padding-top: 12px; }
.citation-list > span { color: var(--muted); font-size: 11px; font-weight: 800; letter-spacing: .05em; }
.citation-list ul { margin: 8px 0 0; padding-left: 20px; display: grid; gap: 5px; }
.citation-list.plain { border-top: 0; padding-top: 0; }
.finding-list { margin: 0; padding-left: 20px; display: grid; gap: 8px; line-height: 1.6; }
.error-state.compact { margin-bottom: 18px; padding: 24px; }
@media (max-width: 1080px) {
  .snapshot-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stat-grid, .grid.four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid.three { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
  .site-header { align-items: flex-start; flex-direction: column; gap: 12px; }
  .main-nav { justify-content: flex-start; }
  .page-heading { align-items: flex-start; flex-direction: column; }
  .snapshot-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat-grid, .grid.two, .grid.three, .grid.four, .kv-grid { grid-template-columns: 1fr; }
  .site-footer { flex-direction: column; }
  .chart { height: 280px; }
  .chart.tall { height: 340px; }
  .toolbar > * { width: 100%; }
}
`;

export const CLIENT_JS = `(() => {
  const charts = new Map();

  function showEmpty(id, message) {
    const empty = document.getElementById(id + '-empty');
    if (empty) {
      empty.textContent = message || '暂无可绘制的数据';
      empty.hidden = false;
    }
    const chart = document.getElementById(id);
    if (chart) chart.hidden = true;
  }

  function initChart(id) {
    if (!window.echarts) {
      showEmpty(id, '图表组件未加载');
      return null;
    }
    if (charts.has(id)) return charts.get(id);
    const element = document.getElementById(id);
    if (!element) return null;
    const chart = window.echarts.init(element);
    charts.set(id, chart);
    return chart;
  }

  function readChartData(id) {
    const element = document.getElementById(id);
    if (!element) return null;
    try { return JSON.parse(element.textContent || 'null'); } catch { return null; }
  }

  function renderStaticCharts() {
    document.querySelectorAll('[data-chart]').forEach((element) => {
      const id = element.id;
      const data = readChartData(element.getAttribute('data-chart'));
      const hasSeries = data && Array.isArray(data.series) && data.series.some((series) => Array.isArray(series.data) && series.data.length > 0);
      if (!hasSeries) {
        showEmpty(id);
        return;
      }
      const chart = initChart(id);
      if (!chart) return;
      const series = data.series.map((item) => ({
        ...item,
        type: item.type || data.type || 'bar',
        smooth: item.type === 'line',
        symbolSize: 5,
        barMaxWidth: 32,
        emphasis: { focus: 'series' },
      }));
      chart.setOption({
        color: ['#0f766e', '#b45309', '#2563eb', '#be123c'],
        animationDuration: 450,
        title: { text: data.title || '', subtext: data.subtitle || '', left: 4, top: 0, textStyle: { fontSize: 15 }, subtextStyle: { color: '#66706d', fontSize: 11 } },
        tooltip: { trigger: 'axis', valueFormatter: (value) => value == null ? '—' : String(value) + (data.unit || '') },
        legend: { top: 4, right: 4 },
        grid: { left: 56, right: 30, top: 70, bottom: 42 },
        xAxis: { type: 'category', data: data.categories || [], axisLabel: { color: '#66706d', rotate: data.rotate || 0 } },
        yAxis: { type: 'value', name: data.unit || '', axisLabel: { color: '#66706d' }, splitLine: { lineStyle: { color: '#ebe8df' } } },
        series,
      });
    });
  }

  function percentileData(values) {
    return values.map((value) => value == null ? null : Math.round(value * 10000) / 100);
  }

  function escapeQuery(value) {
    return encodeURIComponent(value || '');
  }

  function metaQuery(element) {
    const params = new URLSearchParams();
    if (element.dataset.date) params.set('date', element.dataset.date);
    if (element.dataset.version) params.set('version', element.dataset.version);
    return params;
  }

  function loadKline() {
    const root = document.getElementById('kline-chart');
    if (!root) return;
    const code = root.dataset.code;
    const period = document.getElementById('kline-period');
    const params = metaQuery(root);
    params.set('period', period ? period.value : 'day');
    params.set('limit', '250');
    const empty = document.getElementById('kline-chart-empty');
    if (empty) empty.hidden = true;
    const chart = initChart('kline-chart');
    if (!chart) return;
    chart.showLoading({ text: '加载 K 线…', color: '#0f766e' });
    fetch('/api/etfs/' + escapeQuery(code) + '/kline?' + params.toString())
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error && body.error.message ? body.error.message : 'K 线读取失败');
        return body.data;
      })
      .then((data) => {
        chart.hideLoading();
        const rows = data.rows || [];
        if (rows.length === 0) {
          showEmpty('kline-chart', '本地 K 线缓存为空，且尚未补拉到数据');
          return;
        }
        root.hidden = false;
        const dates = rows.map((row) => row.date);
        const candles = rows.map((row) => [row.open, row.close, row.low, row.high]);
        const volumes = rows.map((row, index) => [index, row.volume, row.close >= row.open ? 1 : -1]);
        const movingAverage = (windowSize) => dates.map((_, index) => {
          if (index + 1 < windowSize) return null;
          let total = 0;
          for (let cursor = index - windowSize + 1; cursor <= index; cursor += 1) total += rows[cursor].close;
          return Math.round((total / windowSize) * 10000) / 10000;
        });
        chart.setOption({
          animation: false,
          title: {
            text: data.periodLabel + ' K 线',
            subtext: '范围 ' + dates[0] + ' 至 ' + dates[dates.length - 1] + ' · 前复权（adjust=1）· 分析日 ' + (data.analysisDate || ''),
            left: 4,
            textStyle: { fontSize: 16 },
            subtextStyle: { color: '#66706d', fontSize: 11 },
          },
          legend: { top: 4, right: 4, data: ['K 线', 'MA5', 'MA20', 'MA60'] },
          tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
          axisPointer: { link: [{ xAxisIndex: 'all' }] },
          grid: [
            { left: 62, right: 24, top: 76, height: '58%' },
            { left: 62, right: 24, top: '76%', height: '12%' }
          ],
          xAxis: [
            { type: 'category', data: dates, boundaryGap: true, axisLabel: { show: false }, axisLine: { lineStyle: { color: '#d8d5cc' } } },
            { type: 'category', gridIndex: 1, data: dates, boundaryGap: true, axisLabel: { color: '#66706d' }, axisLine: { lineStyle: { color: '#d8d5cc' } } }
          ],
          yAxis: [
            { scale: true, name: '价格', axisLabel: { color: '#66706d' }, splitLine: { lineStyle: { color: '#ebe8df' } } },
            { scale: true, gridIndex: 1, name: '成交量', axisLabel: { show: false }, splitLine: { show: false } }
          ],
          dataZoom: [
            { type: 'inside', xAxisIndex: [0, 1], start: Math.max(0, 100 - Math.min(100, 10000 / rows.length)), end: 100 },
            { type: 'slider', xAxisIndex: [0, 1], bottom: 4, height: 18, borderColor: '#d8d5cc' }
          ],
          series: [
            { name: 'K 线', type: 'candlestick', data: candles, itemStyle: { color: '#b42318', color0: '#067647', borderColor: '#b42318', borderColor0: '#067647' } },
            { name: 'MA5', type: 'line', data: movingAverage(5), symbol: 'none', lineStyle: { width: 1 } },
            { name: 'MA20', type: 'line', data: movingAverage(20), symbol: 'none', lineStyle: { width: 1 } },
            { name: 'MA60', type: 'line', data: movingAverage(60), symbol: 'none', lineStyle: { width: 1 } },
            { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumes, itemStyle: { color: (params) => params.data[2] > 0 ? 'rgba(180,35,24,.55)' : 'rgba(6,118,71,.55)' } }
          ]
        }, true);
      })
      .catch((error) => {
        chart.hideLoading();
        showEmpty('kline-chart', error.message || 'K 线读取失败');
      });
  }

  function loadHistory() {
    const root = document.getElementById('history-chart');
    if (!root) return;
    const params = metaQuery(root);
    const range = document.getElementById('history-range');
    params.set('range', range ? range.value : '1y');
    const chart = initChart('history-chart');
    if (!chart) return;
    chart.showLoading({ text: '加载历史特征…', color: '#0f766e' });
    fetch('/api/etfs/' + escapeQuery(root.dataset.code) + '/history?' + params.toString())
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error && body.error.message ? body.error.message : '历史特征读取失败');
        return body.data;
      })
      .then((data) => {
        chart.hideLoading();
        const items = data.items || [];
        if (items.length === 0) {
          showEmpty('history-chart', '该时间范围内没有已发布快照');
          return;
        }
        root.hidden = false;
        const dates = items.map((item) => item.analysisDate);
        chart.setOption({
          title: { text: '历史特征序列', subtext: dates[0] + ' 至 ' + dates[dates.length - 1] + ' · 来源：每日已发布快照', left: 4, textStyle: { fontSize: 16 }, subtextStyle: { color: '#66706d', fontSize: 11 } },
          tooltip: { trigger: 'axis' },
          legend: { top: 4, right: 4 },
          grid: { left: 62, right: 58, top: 74, bottom: 44 },
          xAxis: { type: 'category', data: dates, axisLabel: { color: '#66706d' } },
          yAxis: [
            { type: 'value', name: '收益率 %', axisLabel: { color: '#66706d' }, splitLine: { lineStyle: { color: '#ebe8df' } } },
            { type: 'value', name: '年化波动 %', axisLabel: { color: '#66706d' }, splitLine: { show: false } }
          ],
          series: [
            { name: '20D 收益', type: 'line', data: percentileData(items.map((item) => item.returns && item.returns['20d'])), symbol: 'circle', symbolSize: 4 },
            { name: '20D 波动', type: 'line', yAxisIndex: 1, data: percentileData(items.map((item) => item.risk && item.risk.volatility20d)), symbol: 'none' }
          ]
        }, true);
      })
      .catch((error) => {
        chart.hideLoading();
        showEmpty('history-chart', error.message || '历史特征读取失败');
      });
  }

  function initTabs() {
    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const group = button.closest('[data-tabs]');
        if (!group) return;
        group.querySelectorAll('[data-tab]').forEach((item) => item.setAttribute('aria-selected', String(item === button)));
        group.querySelectorAll('[data-panel]').forEach((panel) => {
          panel.hidden = panel.getAttribute('data-panel') !== button.getAttribute('data-tab');
        });
        window.setTimeout(() => charts.forEach((chart) => chart.resize()), 30);
      });
    });
  }

  window.addEventListener('resize', () => charts.forEach((chart) => chart.resize()));
  document.addEventListener('DOMContentLoaded', () => {
    renderStaticCharts();
    initTabs();
    loadKline();
    loadHistory();
    const period = document.getElementById('kline-period');
    if (period) period.addEventListener('change', loadKline);
    const range = document.getElementById('history-range');
    if (range) range.addEventListener('change', loadHistory);
  });
})();
`;

let echartsBundle: Promise<string> | undefined;

export function loadEchartsBundle(): Promise<string> {
  echartsBundle ??= (async () => {
    const require = createRequire(import.meta.url);
    return readFile(require.resolve("echarts/dist/echarts.min.js"), "utf8");
  })();
  return echartsBundle;
}
