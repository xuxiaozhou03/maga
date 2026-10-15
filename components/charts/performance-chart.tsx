/**
 * 资产曲线 + 回撤曲线。
 *
 * 纯 SVG，无第三方图表依赖，可在服务端渲染。
 * 路径用 `preserveAspectRatio="none"` 拉伸以填满容器，文字放在 HTML 层，
 * 因此文字不会被横向拉伸。
 */

import { formatMoney, formatPercent, formatYmdCompact } from "@/lib/format";

export type PerformancePoint = {
  date: number;
  totalAssets: number;
  drawdown: number | null;
};

export type PerformanceChartProps = {
  points: readonly PerformancePoint[];
  initialCash: number;
};

const W = 1000;
const H = 320;
const EQUITY_TOP = 12;
const EQUITY_BOTTOM = 214;
const DD_TOP = 248;
const DD_BOTTOM = 306;

function line(values: readonly number[], scale: (value: number) => number): string {
  if (values.length === 0) return "";
  const step = values.length === 1 ? 0 : W / (values.length - 1);
  return values
    .map((value, index) => `${index === 0 ? "M" : "L"}${(index * step).toFixed(2)},${scale(value).toFixed(2)}`)
    .join(" ");
}

export function PerformanceChart({ points, initialCash }: PerformanceChartProps) {
  if (points.length < 2) {
    return (
      <div className="flex h-80 items-center justify-center rounded-md border border-dashed border-zinc-200 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        没有足够的每日记录用于绘制曲线
      </div>
    );
  }

  const equity = points.map((point) => point.totalAssets);
  const drawdowns = points.map((point) => point.drawdown ?? 0);

  const equityMax = Math.max(...equity, initialCash);
  const equityMin = Math.min(...equity, initialCash);
  const equitySpan = equityMax - equityMin || 1;

  const ddMin = Math.min(...drawdowns, 0);
  const ddSpan = Math.abs(ddMin) || 1;

  const scaleEquity = (value: number) =>
    EQUITY_BOTTOM - ((value - equityMin) / equitySpan) * (EQUITY_BOTTOM - EQUITY_TOP);
  const scaleDrawdown = (value: number) => DD_TOP + (Math.abs(value) / ddSpan) * (DD_BOTTOM - DD_TOP);

  const equityLine = line(equity, scaleEquity);
  const equityArea = `${equityLine} L${W},${EQUITY_BOTTOM} L0,${EQUITY_BOTTOM} Z`;

  const ddLine = line(drawdowns, scaleDrawdown);
  const ddArea = `${ddLine} L${W},${DD_TOP} L0,${DD_TOP} Z`;

  const baselineY = scaleEquity(initialCash);
  const maxY = scaleEquity(equityMax);
  const minY = scaleEquity(equityMin);
  const ddMinY = scaleDrawdown(ddMin);

  const first = points[0];
  const last = points[points.length - 1];
  const pct = (y: number) => `${((y / H) * 100).toFixed(2)}%`;

  return (
    <div className="relative h-80 w-full" role="img" aria-label="资产与回撤曲线">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* 资产曲线 */}
        <path className="fill-blue-500/10" d={equityArea} />
        <path
          className="fill-none stroke-blue-600 dark:stroke-blue-400"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          d={equityLine}
        />

        {/* 初始资金基准线 */}
        <line
          className="stroke-zinc-400 dark:stroke-zinc-600"
          strokeWidth={1}
          strokeDasharray="6 6"
          vectorEffect="non-scaling-stroke"
          x1={0}
          x2={W}
          y1={baselineY}
          y2={baselineY}
        />

        {/* 回撤曲线（0 轴在上，向下为回撤） */}
        <path className="fill-rose-500/10" d={ddArea} />
        <path
          className="fill-none stroke-rose-500 dark:stroke-rose-400"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          d={ddLine}
        />
        <line
          className="stroke-zinc-300 dark:stroke-zinc-700"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          x1={0}
          x2={W}
          y1={DD_TOP}
          y2={DD_TOP}
        />
      </svg>

      {/* 文字层：不受 SVG 横向拉伸影响 */}
      <div className="pointer-events-none absolute inset-0">
        <span
          className="absolute right-1 -translate-y-1/2 rounded bg-white/80 px-1 text-xs tabular-nums text-zinc-500 dark:bg-zinc-950/70 dark:text-zinc-400"
          style={{ top: pct(maxY) }}
        >
          {formatMoney(equityMax, 0)}
        </span>
        <span
          className="absolute right-1 -translate-y-1/2 rounded bg-white/80 px-1 text-xs tabular-nums text-zinc-500 dark:bg-zinc-950/70 dark:text-zinc-400"
          style={{ top: pct(minY) }}
        >
          {formatMoney(equityMin, 0)}
        </span>
        <span
          className="absolute left-1 -translate-y-1/2 rounded bg-white/80 px-1 text-xs tabular-nums text-zinc-400 dark:bg-zinc-950/70 dark:text-zinc-500"
          style={{ top: pct(baselineY) }}
        >
          初始 {formatMoney(initialCash, 0)}
        </span>
        <span
          className="absolute left-1 text-xs font-medium text-zinc-500 dark:text-zinc-400"
          style={{ top: `calc(${pct(DD_TOP)} - 18px)` }}
        >
          回撤
        </span>
        <span
          className="absolute right-1 translate-y-1/2 rounded bg-white/80 px-1 text-xs tabular-nums text-rose-600 dark:bg-zinc-950/70 dark:text-rose-400"
          style={{ top: pct(ddMinY) }}
        >
          {formatPercent(ddMin)}
        </span>
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          <span>{formatYmdCompact(first.date)}</span>
          <span>{formatYmdCompact(last.date)}</span>
        </div>
      </div>
    </div>
  );
}
