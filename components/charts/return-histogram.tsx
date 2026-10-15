/**
 * 日收益分布直方图。
 *
 * 纯 DOM 实现：柱子按计数归一化，负收益区间用红色、正收益区间用绿色。
 */

import { formatPercent } from "@/lib/format";

export type HistogramBin = {
  from: number;
  to: number;
  count: number;
};

export function ReturnHistogram({ bins }: { bins: readonly HistogramBin[] }) {
  if (bins.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-zinc-200 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        没有可用于分布统计的日收益
      </div>
    );
  }

  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  const total = bins.reduce((acc, bin) => acc + bin.count, 0);
  const min = bins[0].from;
  const max = bins[bins.length - 1].to;
  const span = max - min || 1;
  const zeroOffset = min < 0 && max > 0 ? ((0 - min) / span) * 100 : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-40">
        {zeroOffset !== null ? (
          <div
            className="absolute bottom-0 top-0 w-px bg-zinc-300 dark:bg-zinc-700"
            style={{ left: `${zeroOffset}%` }}
            aria-hidden="true"
          />
        ) : null}
        <div className="flex h-full items-end gap-px">
          {bins.map((bin) => {
            const negative = (bin.from + bin.to) / 2 < 0;
            return (
              <div
                key={bin.from}
                className={`flex-1 rounded-t-sm ${negative ? "bg-rose-400/70 dark:bg-rose-500/60" : "bg-emerald-400/70 dark:bg-emerald-500/60"}`}
                style={{ height: `${Math.max((bin.count / maxCount) * 100, bin.count > 0 ? 2 : 0)}%` }}
                title={`${formatPercent(bin.from)} ~ ${formatPercent(bin.to)}：${bin.count} 天`}
              />
            );
          })}
        </div>
      </div>
      <div className="flex justify-between text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
        <span>{formatPercent(min)}</span>
        <span className="text-zinc-400 dark:text-zinc-500">共 {total} 个交易日</span>
        <span>{formatPercent(max)}</span>
      </div>
    </div>
  );
}
