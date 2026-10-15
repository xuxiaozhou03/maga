/**
 * 指标展示单元。数字使用等宽数字排版，避免扫读时抖动。
 */

import type { ReactNode } from "react";

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</div>
  );
}

export type StatProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** 数值语义色：正向 / 负向 / 中性。 */
  tone?: "neutral" | "positive" | "negative";
};

const TONE_CLASS: Record<NonNullable<StatProps["tone"]>, string> = {
  neutral: "text-zinc-900 dark:text-zinc-100",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-rose-600 dark:text-rose-400",
};

export function Stat({ label, value, hint, tone = "neutral" }: StatProps) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${TONE_CLASS[tone]}`}>
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{hint}</div> : null}
    </div>
  );
}

/** 数值正负 → 语义色。 */
export function toneOf(value: number | null): NonNullable<StatProps["tone"]> {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}
