import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SeriesChart } from "@/components/charts/series-chart";
import { RunStatusBadge } from "@/components/backtest-table";
import { Stat, StatGrid, toneOf } from "@/components/stat";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  formatYmdCompact,
} from "@/lib/format";
import { summarizeStoredRun } from "@/services/backtest/summary";
import { getBacktestRun } from "@/services/repositories/backtest.repository";
import { getRegisteredStrategy } from "@/services/strategy";

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const cell = "whitespace-nowrap px-3 py-1.5 tabular-nums";

export const instant = false;

export default async function BacktestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const stored = await getBacktestRun(id);
  if (!stored) notFound();

  const { run, etfs } = stored;
  const { dailyRecords, orders, metrics } = summarizeStoredRun({
    initialCash: run.initialCash,
    dailyRecords: stored.dailyRecords,
    orders: stored.orders,
  });

  const registered = run.strategyId ? getRegisteredStrategy(run.strategyId) : undefined;
  const parameters = safeParse<Record<string, unknown>>(run.parametersJson, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/backtests"
          className="inline-flex w-fit items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          回测记录
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">
            {registered?.name ?? run.strategyId ?? "回测详情"}
          </h1>
          <RunStatusBadge status={run.status} />
          <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
            {run.strategyId ?? "—"}
          </span>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex gap-1.5">
            <dt>区间</dt>
            <dd className="tabular-nums">
              {formatYmdCompact(run.startDate)} ~ {formatYmdCompact(run.endDate)}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>标的</dt>
            <dd className="font-mono">{etfs.map((item) => item.etfCode).join(", ")}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>引擎</dt>
            <dd className="tabular-nums">{run.engineVersion}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>创建</dt>
            <dd className="tabular-nums">{formatDateTime(run.createdAt)}</dd>
          </div>
        </dl>
      </div>

      {run.status === "failed" ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {run.errorMessage ?? "回测失败"}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <StatGrid>
          <Stat label="期末总资产" value={formatMoney(metrics.finalTotalAssets)} />
          <Stat
            label="总收益率"
            value={formatSignedPercent(metrics.totalReturn)}
            tone={toneOf(metrics.totalReturn)}
          />
          <Stat
            label="年化收益率"
            value={formatSignedPercent(metrics.annualizedReturn)}
            tone={toneOf(metrics.annualizedReturn)}
          />
          <Stat
            label="最大回撤"
            value={formatPercent(metrics.maxDrawdown)}
            tone={metrics.maxDrawdown === null ? "neutral" : "negative"}
          />
          <Stat label="年化波动率" value={formatPercent(metrics.annualizedVolatility)} />
          <Stat label="夏普比率" value={formatNumber(metrics.sharpeRatio)} />
          <Stat label="成交笔数" value={metrics.tradeCount} hint={`${metrics.tradingDays} 个交易日`} />
          <Stat label="总手续费" value={formatMoney(metrics.totalFees)} />
          <Stat label="胜率" value={formatPercent(metrics.winRate)} />
          <Stat label="平均盈利" value={formatMoney(metrics.averageWin)} />
          <Stat label="平均亏损" value={formatMoney(metrics.averageLoss)} />
          <Stat
            label="期末持仓市值"
            value={formatMoney(metrics.finalMarketValue)}
            hint={`现金 ${formatMoney(metrics.finalCash)}`}
          />
        </StatGrid>
        {Object.keys(metrics.reasons).length > 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {Object.entries(metrics.reasons)
              .map(([key, reason]) => `${key}：${reason}`)
              .join("；")}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">资产与回撤</h2>
        <div className="rounded-md border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <SeriesChart
            baseline={metrics.initialCash}
            baselineLabel="初始"
            points={dailyRecords.map((record) => ({
              date: record.date,
              value: record.totalAssets,
              drawdown: record.drawdown,
            }))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">订单与成交</h2>
        {orders.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            本次回测没有产生订单
          </p>
        ) : (
          <div className="max-h-96 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">日期</th>
                  <th className="px-3 py-2 text-left font-medium">代码</th>
                  <th className="px-3 py-2 text-left font-medium">方向</th>
                  <th className="px-3 py-2 text-right font-medium">数量</th>
                  <th className="px-3 py-2 text-right font-medium">价格</th>
                  <th className="px-3 py-2 text-right font-medium">金额</th>
                  <th className="px-3 py-2 text-right font-medium">费用</th>
                  <th className="px-3 py-2 text-right font-medium">盈亏</th>
                  <th className="px-3 py-2 text-left font-medium">结果</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, index) => (
                  <tr
                    key={`${order.date}-${order.code}-${index}`}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className={`${cell} text-zinc-500 dark:text-zinc-400`}>
                      {formatYmdCompact(order.date)}
                    </td>
                    <td className={`${cell} font-mono text-xs`}>{order.code}</td>
                    <td className={cell}>
                      <span
                        className={
                          order.side === "buy"
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }
                      >
                        {order.side === "buy" ? "买入" : "卖出"}
                      </span>
                    </td>
                    <td className={`${cell} text-right`}>
                      {order.status === "filled"
                        ? order.executedQuantity.toLocaleString("zh-CN")
                        : order.requestedQuantity.toLocaleString("zh-CN")}
                    </td>
                    <td className={`${cell} text-right`}>{order.price.toFixed(3)}</td>
                    <td className={`${cell} text-right`}>{formatMoney(order.amount)}</td>
                    <td className={`${cell} text-right`}>{formatMoney(order.fee)}</td>
                    <td
                      className={`${cell} text-right ${
                        order.realizedPnl === null
                          ? "text-zinc-400 dark:text-zinc-500"
                          : order.realizedPnl >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {order.realizedPnl === null ? "—" : formatMoney(order.realizedPnl)}
                    </td>
                    <td className={`${cell} text-xs text-zinc-500 dark:text-zinc-400`}>
                      {order.status === "filled" ? "成交" : order.reason ?? "未成交"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">每日记录</h2>
        <div className="max-h-96 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">日期</th>
                <th className="px-3 py-2 text-right font-medium">现金</th>
                <th className="px-3 py-2 text-right font-medium">持仓市值</th>
                <th className="px-3 py-2 text-right font-medium">总资产</th>
                <th className="px-3 py-2 text-right font-medium">日收益</th>
                <th className="px-3 py-2 text-right font-medium">回撤</th>
                <th className="px-3 py-2 text-right font-medium">累计费用</th>
              </tr>
            </thead>
            <tbody>
              {dailyRecords.map((record) => (
                <tr key={record.date} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className={`${cell} text-zinc-500 dark:text-zinc-400`}>
                    {formatYmdCompact(record.date)}
                  </td>
                  <td className={`${cell} text-right`}>{formatMoney(record.cash)}</td>
                  <td className={`${cell} text-right`}>{formatMoney(record.marketValue)}</td>
                  <td className={`${cell} text-right font-medium`}>
                    {formatMoney(record.totalAssets)}
                  </td>
                  <td
                    className={`${cell} text-right ${
                      record.dailyReturn === null
                        ? "text-zinc-400 dark:text-zinc-500"
                        : record.dailyReturn >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {formatSignedPercent(record.dailyReturn)}
                  </td>
                  <td className={`${cell} text-right text-rose-600 dark:text-rose-400`}>
                    {record.drawdown === null ? "—" : formatPercent(record.drawdown)}
                  </td>
                  <td className={`${cell} text-right text-zinc-500 dark:text-zinc-400`}>
                    {formatMoney(record.fees)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">配置快照</h2>
        <dl className="grid gap-x-6 gap-y-2 rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">策略参数</dt>
            <dd className="truncate font-mono text-xs">{JSON.stringify(parameters)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">成交模型</dt>
            <dd>当日收盘价理想化模拟</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">价格模型</dt>
            <dd>前复权</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">行情指纹</dt>
            <dd className="truncate font-mono text-xs">{run.dataFingerprint ?? "—"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
