/**
 * 回测任务表格。首页与回测列表页共用。
 */

import Link from "next/link";
import type { BacktestRun } from "@prisma/client";
import { formatDateTime, formatMoney, formatYmdCompact } from "@/lib/format";

export function RunStatusBadge({ status }: { status: string }) {
  const done = status === "completed";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
        done
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
          : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
      }`}
    >
      {done ? "已完成" : "失败"}
    </span>
  );
}

export function BacktestTable({
  runs,
  emptyText = "还没有回测记录",
}: {
  runs: readonly BacktestRun[];
  emptyText?: string;
}) {
  if (runs.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-3 py-2 text-left font-medium">策略</th>
            <th className="px-3 py-2 text-left font-medium">区间</th>
            <th className="px-3 py-2 text-right font-medium">初始资金</th>
            <th className="px-3 py-2 text-left font-medium">状态</th>
            <th className="px-3 py-2 text-left font-medium">创建时间</th>
            <th className="px-3 py-2 text-left font-medium">引擎</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <td className="whitespace-nowrap px-3 py-2">
                <Link href={`/backtests/${run.id}`} className="font-medium hover:underline">
                  {run.strategyId ?? "—"}
                </Link>
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                {formatYmdCompact(run.startDate)} ~ {formatYmdCompact(run.endDate)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                {formatMoney(run.initialCash, 0)}
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <RunStatusBadge status={run.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-zinc-500 dark:text-zinc-400">
                {formatDateTime(run.createdAt)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-zinc-400 dark:text-zinc-500">
                {run.engineVersion}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
