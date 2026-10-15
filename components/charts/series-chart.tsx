/**
 * 单序列走势 + 回撤的双区图。
 *
 * 纯 SVG，无第三方图表依赖，可在服务端渲染。
 * 路径用 `preserveAspectRatio="none"` 拉伸填满容器，文字放在 HTML 层，
 * 因此文字不会被横向拉伸。回测资产曲线与 ETF 价格曲线共用这个组件。
 */

import { formatMoney, formatPercent, formatYmdCompact } from "@/lib/format";

export type SeriesPoint = {
  date: number;
  value: number;
  drawdown: number | null;
};

export type SeriesChartProps = {
  points: readonly SeriesPoint[];
  /** 基准线数值，例如初始资金或首日收盘价。 */
  baseline: number;
  /** 基准线标签，例如「初始」「首日」。 */
  baselineLabel: string;
  /** 数值格式化，默认按金额两位小数。 */
  formatValue?: (value: number) => string;
  emptyText?: string;
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
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"}${(index * step).toFixed(2)},${scale(value).toFixed(2)}`,
    )
    .join(" ");
}

export function SeriesChart({
  points,
  baseline,
  baselineLabel,
  formatValue = (value) => formatMoney(value),
  emptyText = "没有足够的数据用于绘制曲线",
}: SeriesChartProps) {
  if (points.length < 2) {
    return (
      <div className="flex h-80 items-center justify-center rounded-md border border-dashed border-zinc-200 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {emptyText}
      </div>
    );
  }

  const values = points.map((point) => point.value);
  const drawdowns = points.map((point) => point.drawdown ?? 0);

  const valueMax = Math.max(...values, baseline);
  const valueMin = Math.min(...values, baseline);
  const valueSpan = valueMax - valueMin || 1;

  const ddMin = Math.min(...drawdowns, 0);
  const ddSpan = Math.abs(ddMin) || 1;

  const scaleValue = (value: number) =>
    EQUITY_BOTTOM - ((value - valueMin) / valueSpan) * (EQUITY_BOTTOM - EQUITY_TOP);
  const scaleDrawdown = (value: number) => DD_TOP + (Math.abs(value) / ddSpan) * (DD_BOTTOM - DD_TOP);

  const valueLine = line(values, scaleValue);
  const valueArea = `${valueLine} L${W},${EQUITY_BOTTOM} L0,${EQUITY_BOTTOM} Z`;

  const ddLine = line(drawdowns, scaleDrawdown);
  const ddArea = `${ddLine} L${W},${DD_TOP} L0,${DD_TOP} Z`;

  const baselineY = scaleValue(baseline);
  const maxY = scaleValue(valueMax);
  const minY = scaleValue(valueMin);
  const ddMinY = scaleDrawdown(ddMin);

  const first = points[0];
  const last = points[points.length - 1];
  const pct = (y: number) => `${((y / H) * 100).toFixed(2)}%`;

  return (
    <div className="relative h-80 w-full">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="fill-blue-500/10" d={valueArea} />
        <path
          className="fill-none stroke-blue-600 dark:stroke-blue-400"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          d={valueLine}
        />

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

      {/* 文字层：不随 SVG 横向拉伸 */}
      <div className="pointer-events-none absolute inset-0">
        <span
          className="absolute right-1 -translate-y-1/2 rounded bg-white/80 px-1 text-xs tabular-nums text-zinc-500 dark:bg-zinc-900/80 dark:text-zinc-400"
          style={{ top: pct(maxY) }}
        >
          {formatValue(valueMax)}
        </span>
        <span
          className="absolute right-1 -translate-y-1/2 rounded bg-white/80 px-1 text-xs tabular-nums text-zinc-500 dark:bg-zinc-900/80 dark:text-zinc-400"
          style={{ top: pct(minY) }}
        >
          {formatValue(valueMin)}
        </span>
        <span
          className="absolute left-1 -translate-y-1/2 rounded bg-white/80 px-1 text-xs tabular-nums text-zinc-400 dark:bg-zinc-900/80 dark:text-zinc-500"
          style={{ top: pct(baselineY) }}
        >
          {baselineLabel} {formatValue(baseline)}
        </span>
        <span
          className="absolute left-1 text-xs font-medium text-zinc-500 dark:text-zinc-400"
          style={{ top: `calc(${pct(DD_TOP)} - 18px)` }}
        >
          回撤
        </span>
        <span
          className="absolute right-1 translate-y-1/2 rounded bg-white/80 px-1 text-xs tabular-nums text-rose-600 dark:bg-zinc-900/80 dark:text-rose-400"
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
