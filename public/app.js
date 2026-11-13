const API_BASE = `${location.origin}/api`;

async function api(path, init = {}) {
  const response = await fetch(API_BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = JSON.parse(text).error || text;
    } catch {
      // Keep the raw response when it is not JSON.
    }
    throw new Error(`${response.status} ${message}`);
  }
  return text ? JSON.parse(text) : null;
}

const fmtPct = (value, digits = 2) =>
  value == null || !Number.isFinite(Number(value))
    ? "-"
    : `${(Number(value) * 100).toFixed(digits)}%`;

const fmtNum = (value, digits = 4) =>
  value == null || !Number.isFinite(Number(value))
    ? "-"
    : Number(value).toFixed(digits);

const fmtMoney = (value) =>
  value == null || !Number.isFinite(Number(value))
    ? "-"
    : Number(value).toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtDate = (value) =>
  value == null
    ? "-"
    : String(value).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");

const fmtDateTime = (value) =>
  value ? new Intl.DateTimeFormat("zh-CN", { hour12: false }).format(new Date(value)) : "-";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const colorClass = (value) => {
  if (value == null || !Number.isFinite(Number(value))) return "";
  if (Number(value) > 0) return "positive";
  if (Number(value) < 0) return "negative";
  return "";
};

const statusPill = (status) => {
  const label = { running: "运行中", success: "已完成", failed: "失败" }[status] || status;
  return `<span class="status status-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
};

const parseCodes = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

function emptyState(title, detail = "") {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}</div>`;
}

function table(element, headers, rows, emptyTitle = "暂无数据") {
  if (!element) return;
  if (!rows.length) {
    element.innerHTML = emptyState(emptyTitle);
    return;
  }
  element.innerHTML = `<div class="table-wrap"><table><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${cell ?? "-"}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.innerHTML;
  button.disabled = busy;
  button.innerHTML = busy
    ? `<span class="spinner"></span>${escapeHtml(label || "处理中")}`
    : button.dataset.label;
  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function toast(message, tone = "info") {
  let element = document.querySelector(".toast");
  if (!element) {
    element = document.createElement("div");
    element.className = "toast";
    document.body.appendChild(element);
  }
  element.className = `toast toast-${tone} is-visible`;
  element.textContent = message;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    element.classList.remove("is-visible");
  }, 3200);
}

function equityChart(element, dailies, initialCash = 1_000_000) {
  if (!element || typeof window.echarts === "undefined") return null;
  element.innerHTML = "";
  const chart = window.echarts.init(element);
  const values = dailies.map((daily) => daily.equity);
  const min = Math.min(...values, initialCash);
  const max = Math.max(...values, initialCash);
  chart.setOption({
    animationDuration: 450,
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => `¥${fmtMoney(value)}`,
    },
    grid: { left: 72, right: 24, top: 24, bottom: 44 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dailies.map((daily) => fmtDate(daily.date)),
      axisLine: { lineStyle: { color: "#c9d1d9" } },
      axisLabel: { color: "#64717d" },
    },
    yAxis: {
      type: "value",
      min: Math.floor((min / initialCash) * 100) < 98 ? min * 0.985 : initialCash * 0.98,
      max: max * 1.015,
      axisLabel: {
        color: "#64717d",
        formatter: (value) => `${(value / 10000).toFixed(0)}万`,
      },
      splitLine: { lineStyle: { color: "#e8edf1" } },
    },
    series: [
      {
        name: "组合权益",
        type: "line",
        smooth: 0.2,
        showSymbol: false,
        lineStyle: { width: 2.2, color: "#146b63" },
        itemStyle: { color: "#146b63" },
        areaStyle: { color: "rgba(20, 107, 99, 0.09)" },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#aeb8c2", type: "dashed" },
          label: { formatter: "初始资金", color: "#7b8792" },
          data: [{ yAxis: initialCash }],
        },
        data: values,
      },
    ],
  });
  const resize = () => chart.resize();
  window.addEventListener("resize", resize);
  return chart;
}

document.addEventListener("DOMContentLoaded", refreshIcons);
