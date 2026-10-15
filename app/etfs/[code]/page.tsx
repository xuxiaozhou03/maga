import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReturnHistogram } from "@/components/charts/return-histogram";
import { SeriesChart } from "@/components/charts/series-chart";
import { Stat, StatGrid, toneOf } from "@/components/stat";
import {
  formatCompact,
  formatCount,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPercentValue,
  formatSignedPercent,
  formatYi,
  formatYmdCompact,
} from "@/lib/format";
import { analyzeKlines } from "@/services/analysis/etf-analysis";
import { getEtf } from "@/services/repositories/etf.repository";
import { getKlines } from "@/services/repositories/kline.repository";

export const instant = false;

const RECENT_BARS = 30;
const cell = "whitespace-nowrap px-3 py-1.5 tabular-nums";

export default async function EtfDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const etf = await getEtf(decodeURIComponent(code));
  if (!etf) notFound();

  const bars = await getKlines({ code: etf.code });
  const analysis = analyzeKlines(bars);
  const recent = bars.slice(-RECENT_BARS).reverse();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/etfs"
          className="inline-flex w-fit items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          ETF 列表
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">{etf.name}</h1>
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{etf.code}</span>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex gap-1.5">
            <dt>跟踪指数</dt>
            <dd>{etf.trackingIndex || "—"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>指数代码</dt>
            <dd className="font-mono">{etf.trackIndex || "—"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>规模</dt>
            <dd className="tabular-nums">{formatYi(etf.scale)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>溢价率</dt>
            <dd className="tabular-nums">{formatPercentValue(etf.premiumRate)}</dd>
          </div>
        </dl>
      </div>

      {analysis.count === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          这只 ETF 还没有行情数据，先运行一次采集。
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">区间统计</h2>
            <StatGrid>
              <Stat label="数据区间" value={`${formatYmdCompact(analysis.firstDate)} ~ ${formatYmdCompact(analysis.lastDate)}`} />
              <Stat label="交易日数" value={formatCount(analysis.count)} />
              <Stat label="最新收盘" value={formatMoney(analysis.lastClose, 3)} />
              <Stat
                label="区间收益"
                value={formatSignedPercent(analysis.totalReturn)}
                tone={toneOf(analysis.totalReturn)}
              />
              <Stat
                label="年化收益"
                value={formatSignedPercent(analysis.annualizedReturn)}
                tone={toneOf(analysis.annualizedReturn)}
              />
              <Stat label="年化波动率" value={formatPercent(analysis.annualizedVolatility)} />
              <Stat
                label="最大回撤"
                value={formatPercent(analysis.maxDrawdown)}
                tone={analysis.maxDrawdown === null ? "neutral" : "negative"}
              />
              <Stat label="夏普比率" value={formatNumber(analysis.sharpeRatio)} />
              <Stat label="上涨天数占比" value={formatPercent(analysis.upDayRatio)} />
              <Stat label="平均日收益" value={formatSignedPercent(analysis.averageDailyReturn)} tone={toneOf(analysis.averageDailyReturn)} />
              <Stat label="最好单日" value={formatSignedPercent(analysis.bestDay?.value ?? null)} tone="positive" />
              <Stat label="最差单日" value={formatSignedPercent(analysis.worstDay?.value ?? null)} tone="negative" />
              <Stat label="价格区间" value={`${formatMoney(analysis.minClose, 3)} ~ ${formatMoney(analysis.maxClose, 3)}`} />
              <Stat label="平均成交额" value={formatCompact(analysis.averageAmount)} />
              <Stat label="平均成交量" value={formatCompact(analysis.averageVolume)} />
              <Stat
                label="最大成交额日"
                value={formatCompact(analysis.maxAmountDay?.value ?? null)}
                hint={analysis.maxAmountDay ? formatYmdCompact(analysis.maxAmountDay.date) : undefined}
              />
              <Stat
                label="最长间隔"
                value={analysis.maxGapDays === null ? "—" : `${analysis.maxGapDays} 天`}
                hint="相邻 K 线的自然日间隔"
              />
            </StatGrid>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">价格与回撤</h2>
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <SeriesChart
                baseline={analysis.firstClose ?? 0}
                baselineLabel="首日"
                formatValue={(value) => formatMoney(value, 3)}
                points={analysis.points.map((point) => ({
                  date: point.date,
                  value: point.close,
                  drawdown: point.drawdown,
                }))}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">日收益分布</h2>
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <ReturnHistogram bins={analysis.returnDistribution} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">数据质量</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              已检查 {formatCount(analysis.quality.checkedBars)} 条：
              {analysis.quality.errors} 个错误、{analysis.quality.warnings} 个警告
            </p>
            {analysis.quality.issues.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">日期</th>
                      <th className="px-3 py-2 text-left font-medium">级别</th>
                      <th className="px-3 py-2 text-left font-medium">规则</th>
                      <th className="px-3 py-2 text-left font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.quality.issues.map((issue, index) => (
                      <tr
                        key={`${issue.rule}-${issue.date}-${index}`}
                        className="border-t border-zinc-100 dark:border-zinc-800"
                      >
                        <td className={`${cell} text-zinc-500 dark:text-zinc-400`}>
                          {formatYmdCompact(issue.date)}
                        </td>
                        <td className={cell}>
                          <span
                            className={
                              issue.severity === "error"
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-amber-600 dark:text-amber-400"
                            }
                          >
                            {issue.severity === "error" ? "错误" : "警告"}
                          </span>
                        </td>
                        <td className={`${cell} font-mono text-xs`}>{issue.rule}</td>
                        <td className="px-3 py-1.5 text-zinc-600 dark:text-zinc-400">{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                未发现异常
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">最近 {recent.length} 个交易日</h2>
            <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">日期</th>
                    <th className="px-3 py-2 text-right font-medium">开</th>
                    <th className="px-3 py-2 text-right font-medium">高</th>
                    <th className="px-3 py-2 text-right font-medium">低</th>
                    <th className="px-3 py-2 text-right font-medium">收</th>
                    <th className="px-3 py-2 text-right font-medium">涨跌幅</th>
                    <th className="px-3 py-2 text-right font-medium">成交量</th>
                    <th className="px-3 py-2 text-right font-medium">成交额</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((bar) => (
                    <tr key={bar.date} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className={`${cell} text-zinc-500 dark:text-zinc-400`}>
                        {formatYmdCompact(bar.date)}
                      </td>
                      <td className={`${cell} text-right`}>{bar.open.toFixed(3)}</td>
                      <td className={`${cell} text-right`}>{bar.high.toFixed(3)}</td>
                      <td className={`${cell} text-right`}>{bar.low.toFixed(3)}</td>
                      <td className={`${cell} text-right font-medium`}>{bar.close.toFixed(3)}</td>
                      <td
                        className={`${cell} text-right ${
                          bar.changePercent >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {bar.changePercent.toFixed(2)}%
                      </td>
                      <td className={`${cell} text-right text-zinc-500 dark:text-zinc-400`}>
                        {formatCompact(bar.volume)}
                      </td>
                      <td className={`${cell} text-right text-zinc-500 dark:text-zinc-400`}>
                        {formatCompact(bar.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
