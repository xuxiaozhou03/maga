import Link from "next/link";
import { Plus } from "lucide-react";
import { BacktestTable } from "@/components/backtest-table";
import { Stat, StatGrid } from "@/components/stat";
import { formatCount, formatDateTime, formatYmdCompact } from "@/lib/format";
import { listBacktestRuns } from "@/services/repositories/backtest.repository";
import { listEtfCodes } from "@/services/repositories/etf.repository";
import { getKlineStats } from "@/services/repositories/kline.repository";
import { listRegisteredStrategies } from "@/services/strategy";

// 页面直接读数据库，属于动态内容；allow blocking route。
export const instant = false;

export default async function Home() {
  const [codes, klineStats, runs, strategies] = await Promise.all([
    listEtfCodes(),
    getKlineStats(),
    listBacktestRuns({ limit: 8 }),
    Promise.resolve(listRegisteredStrategies()),
  ]);

  const latest = runs[0];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold tracking-tight">行情数据</h1>
        <StatGrid>
          <Stat label="ETF 数量" value={formatCount(codes.length)} />
          <Stat label="日 K 条数" value={formatCount(klineStats.count)} />
          <Stat label="数据起始" value={formatYmdCompact(klineStats.firstDate)} />
          <Stat label="数据截止" value={formatYmdCompact(klineStats.lastDate)} />
          <Stat label="已注册策略" value={formatCount(strategies.length)} />
          <Stat label="最近回测" value={latest ? formatDateTime(latest.createdAt) : "—"} />
        </StatGrid>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight">最近回测</h1>
          <Link
            href="/backtests/new"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            新建回测
          </Link>
        </div>
        <BacktestTable runs={runs} />
      </section>
    </div>
  );
}
