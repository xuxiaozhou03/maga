"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";

export type StrategyOption = {
  id: string;
  name: string;
  description: string | null;
  params: Record<string, unknown>;
};

export type EtfOption = {
  code: string;
  name: string;
};

export type NewBacktestFormProps = {
  strategies: StrategyOption[];
  etfs: EtfOption[];
};

/** `2024-01-02` → `20240102`。 */
function toYmd(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const ymd = Number(`${match[1]}${match[2]}${match[3]}`);
  return Number.isInteger(ymd) ? ymd : null;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm tabular-nums outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400";
const labelClass = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function NewBacktestForm({ strategies, etfs }: NewBacktestFormProps) {
  const router = useRouter();

  const [strategyId, setStrategyId] = useState(strategies[0]?.id ?? "");
  const [codes, setCodes] = useState<string[]>([etfs[0]?.code ?? ""]);
  const [startDate, setStartDate] = useState("2024-01-02");
  const [endDate, setEndDate] = useState("2024-12-31");
  const [initialCash, setInitialCash] = useState("100000");
  const [warmupBars, setWarmupBars] = useState("60");
  const [liquidateAtEnd, setLiquidateAtEnd] = useState(false);
  const [paramsText, setParamsText] = useState(() =>
    JSON.stringify(strategies[0]?.params ?? {}, null, 2),
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  const selected = strategies.find((item) => item.id === strategyId);

  function changeStrategy(nextId: string) {
    setStrategyId(nextId);
    const target = strategies.find((item) => item.id === nextId);
    setParamsText(JSON.stringify(target?.params ?? {}, null, 2));
  }

  function toggleCode(code: string) {
    setCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIssues([]);

    const start = toYmd(startDate);
    const end = toYmd(endDate);
    const cash = Number(initialCash);
    const warmup = Number(warmupBars);

    const localIssues: string[] = [];
    if (!strategyId) localIssues.push("请选择策略");
    if (codes.length === 0) localIssues.push("至少选择一个 ETF");
    if (start === null) localIssues.push("开始日期不合法");
    if (end === null) localIssues.push("结束日期不合法");
    if (start !== null && end !== null && start > end) localIssues.push("开始日期不能晚于结束日期");
    if (!Number.isFinite(cash) || cash <= 0) localIssues.push("初始资金必须是正数");
    if (!Number.isInteger(warmup) || warmup < 0) localIssues.push("预热根数必须是非负整数");

    let params: unknown;
    try {
      params = paramsText.trim() === "" ? {} : JSON.parse(paramsText);
      if (typeof params !== "object" || params === null || Array.isArray(params)) {
        localIssues.push("策略参数必须是 JSON 对象");
      }
    } catch {
      localIssues.push("策略参数不是合法 JSON");
    }

    if (localIssues.length > 0) {
      setIssues(localIssues);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/backtests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          strategyId,
          codes,
          startDate: start,
          endDate: end,
          initialCash: cash,
          warmupBars: warmup,
          liquidateAtEnd,
          params,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "回测失败");
        setIssues(Array.isArray(body.issues) ? body.issues : []);
        return;
      }

      router.push(`/backtests/${body.runId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="strategy">
            策略
          </label>
          <select
            id="strategy"
            className={inputClass}
            value={strategyId}
            onChange={(event) => changeStrategy(event.target.value)}
          >
            {strategies.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {selected?.description ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{selected.description}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="cash">
            初始资金
          </label>
          <input
            id="cash"
            className={inputClass}
            type="number"
            min={1}
            step={1000}
            value={initialCash}
            onChange={(event) => setInitialCash(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="start">
            开始日期
          </label>
          <input
            id="start"
            className={inputClass}
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="end">
            结束日期
          </label>
          <input
            id="end"
            className={inputClass}
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>回测标的（{codes.length} 个已选）</span>
        <div className="max-h-44 overflow-y-auto rounded-md border border-zinc-200 p-1 dark:border-zinc-800">
          {etfs.map((etf) => (
            <label
              key={etf.code}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-zinc-900 dark:accent-zinc-100"
                checked={codes.includes(etf.code)}
                onChange={() => toggleCode(etf.code)}
              />
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{etf.code}</span>
              <span className="truncate">{etf.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelClass} htmlFor="params">
          策略参数（JSON）
        </label>
        <textarea
          id="params"
          className={`${inputClass} h-28 font-mono text-xs`}
          value={paramsText}
          spellCheck={false}
          onChange={(event) => setParamsText(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-2">
          <label className={labelClass} htmlFor="warmup">
            预热根数
          </label>
          <input
            id="warmup"
            className={`${inputClass} w-24`}
            type="number"
            min={0}
            step={10}
            value={warmupBars}
            onChange={(event) => setWarmupBars(event.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-zinc-900 dark:accent-zinc-100"
            checked={liquidateAtEnd}
            onChange={(event) => setLiquidateAtEnd(event.target.checked)}
          />
          期末按收盘价清仓
        </label>
      </div>

      {issues.length > 0 ? (
        <ul className="list-inside list-disc rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={submitting || strategies.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          {submitting ? "回测执行中" : "运行回测"}
        </button>
      </div>
    </form>
  );
}
