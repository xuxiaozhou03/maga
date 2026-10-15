import Link from "next/link";
import {
  formatCount,
  formatMoney,
  formatPercentValue,
  formatYi,
  formatYmdCompact,
} from "@/lib/format";
import { listEtfSummaries } from "@/services/repositories/etf.repository";

export const instant = false;

const cell = "whitespace-nowrap px-3 py-2 tabular-nums";

export default async function EtfsPage() {
  const etfs = await listEtfSummaries();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold tracking-tight">ETF 列表</h1>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{etfs.length} 只</span>
      </div>

      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">代码</th>
              <th className="px-3 py-2 text-left font-medium">名称</th>
              <th className="px-3 py-2 text-left font-medium">跟踪指数</th>
              <th className="px-3 py-2 text-right font-medium">规模</th>
              <th className="px-3 py-2 text-right font-medium">溢价率</th>
              <th className="px-3 py-2 text-left font-medium">数据区间</th>
              <th className="px-3 py-2 text-right font-medium">条数</th>
              <th className="px-3 py-2 text-right font-medium">最新收盘</th>
            </tr>
          </thead>
          <tbody>
            {etfs.map((etf) => (
              <tr
                key={etf.code}
                className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <td className={`${cell} font-mono text-xs`}>
                  <Link href={`/etfs/${etf.code}`} className="font-medium hover:underline">
                    {etf.code}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2">{etf.name}</td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-500 dark:text-zinc-400">
                  {etf.trackingIndex || "—"}
                </td>
                <td className={`${cell} text-right`}>{formatYi(etf.scale)}</td>
                <td className={`${cell} text-right`}>{formatPercentValue(etf.premiumRate)}</td>
                <td className={`${cell} text-zinc-500 dark:text-zinc-400`}>
                  {formatYmdCompact(etf.firstDate)} ~ {formatYmdCompact(etf.lastDate)}
                </td>
                <td className={`${cell} text-right`}>{formatCount(etf.barCount)}</td>
                <td className={`${cell} text-right font-medium`}>
                  {etf.lastClose === null ? "—" : formatMoney(etf.lastClose, 3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
