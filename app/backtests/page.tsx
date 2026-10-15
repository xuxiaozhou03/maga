import Link from "next/link";
import { Plus } from "lucide-react";
import { BacktestTable } from "@/components/backtest-table";
import { listBacktestRuns } from "@/services/repositories/backtest.repository";

export const instant = false;

export default async function BacktestsPage() {
  const runs = await listBacktestRuns({ limit: 100 });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold tracking-tight">回测记录</h1>
        <Link
          href="/backtests/new"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          新建回测
        </Link>
      </div>
      <BacktestTable runs={runs} />
    </div>
  );
}
