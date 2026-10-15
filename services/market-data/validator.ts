/**
 * 行情质量校验。
 *
 * 纯函数实现，不依赖数据库，便于单元测试和在写入/读取两侧复用。
 * 规则对应 PRD 4.2：重复日期、非法价格、OHLC 关系、成交量/成交额异常、缺失数据。
 */

import { isValidYmd } from "@/lib/dates";

export type MarketDataSeverity = "error" | "warning";

export type MarketDataIssueRule =
  | "code.mismatch"
  | "date.invalid"
  | "date.duplicate"
  | "date.not_ascending"
  | "price.non_finite"
  | "price.non_positive"
  | "ohlc.high_below_low"
  | "ohlc.high_below_body"
  | "ohlc.low_above_body"
  | "volume.negative"
  | "amount.negative"
  | "volume.zero"
  | "gap.large";

export type MarketDataIssue = {
  code: string;
  date: number | null;
  rule: MarketDataIssueRule;
  severity: MarketDataSeverity;
  message: string;
};

export type MarketDataValidationResult = {
  /** 仅当不存在 `error` 级问题时为 true。 */
  ok: boolean;
  barCount: number;
  issues: MarketDataIssue[];
};

/** 校验所需的最小 K 线结构；`KlineRow` 等更宽的结构可直接传入。 */
export type ValidatableBar = {
  code: string;
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
};

export type ValidateKlinesOptions = {
  /**
   * 相邻交易日允许的最大自然日间隔；超过则记为 `gap.large` 警告。
   * 小于等于 0 表示跳过缺口检查（默认），因为缺失交易日需要真实交易日历才能判定。
   */
  maxGapDays?: number;
};

const PRICE_FIELDS = ["open", "high", "low", "close"] as const;

/** 把 `YYYYMMDD` 转成可用于计算日差的 UTC 毫秒数；非法返回 null。 */
function ymdToUtc(value: number): number | null {
  if (!isValidYmd(value)) return null;
  const year = Math.floor(value / 10000);
  const month = Math.floor((value % 10000) / 100);
  const day = value % 100;
  return Date.UTC(year, month - 1, day);
}

function dayGap(prev: number, next: number): number | null {
  const a = ymdToUtc(prev);
  const b = ymdToUtc(next);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * 校验一段按时间顺序给出的 K 线。
 *
 * 传入顺序即被当作原始顺序来检查“是否升序”，不会在内部重新排序。
 */
export function validateKlines(
  bars: readonly ValidatableBar[],
  options: ValidateKlinesOptions = {},
): MarketDataValidationResult {
  const { maxGapDays = 0 } = options;
  const issues: MarketDataIssue[] = [];
  const seen = new Set<number>();

  let primaryCode: string | null = null;
  let prevDate: number | null = null;

  const push = (
    rule: MarketDataIssueRule,
    severity: MarketDataSeverity,
    code: string,
    date: number | null,
    message: string,
  ) => {
    issues.push({ code, date, rule, severity, message });
  };

  bars.forEach((bar, index) => {
    const code = typeof bar.code === "string" ? bar.code : "";

    if (primaryCode === null) {
      primaryCode = code;
    } else if (code !== primaryCode) {
      push(
        "code.mismatch",
        "error",
        code,
        Number.isFinite(bar.date) ? bar.date : null,
        `第 ${index} 条记录的 code 为 ${code}，与首条 ${primaryCode} 不一致`,
      );
    }

    if (!isValidYmd(bar.date)) {
      push(
        "date.invalid",
        "error",
        code,
        Number.isFinite(bar.date) ? bar.date : null,
        `第 ${index} 条记录的 date 不是合法的 YYYYMMDD 整数：${bar.date}`,
      );
    } else {
      if (seen.has(bar.date)) {
        push("date.duplicate", "error", code, bar.date, `日期 ${bar.date} 重复出现`);
      }
      seen.add(bar.date);

      if (prevDate !== null && bar.date < prevDate) {
        push(
          "date.not_ascending",
          "error",
          code,
          bar.date,
          `日期未按升序排列：${prevDate} -> ${bar.date}`,
        );
      }

      if (prevDate !== null && maxGapDays > 0) {
        const gap = dayGap(prevDate, bar.date);
        if (gap !== null && gap > maxGapDays) {
          push(
            "gap.large",
            "warning",
            code,
            bar.date,
            `${prevDate} 到 ${bar.date} 相隔 ${gap} 个自然日，超过阈值 ${maxGapDays}`,
          );
        }
      }

      prevDate = bar.date;
    }

    for (const field of PRICE_FIELDS) {
      const value = bar[field];
      if (!Number.isFinite(value)) {
        push("price.non_finite", "error", code, bar.date, `${field} 不是有限数值：${value}`);
      } else if (value <= 0) {
        push("price.non_positive", "error", code, bar.date, `${field} 非正数：${value}`);
      }
    }

    const { open, high, low, close } = bar;
    if ([open, high, low, close].every(Number.isFinite)) {
      if (high < low) {
        push("ohlc.high_below_low", "error", code, bar.date, `high(${high}) < low(${low})`);
      }
      const bodyHigh = Math.max(open, close);
      const bodyLow = Math.min(open, close);
      if (high < bodyHigh) {
        push(
          "ohlc.high_below_body",
          "error",
          code,
          bar.date,
          `high(${high}) 低于 open/close 的最大值(${bodyHigh})`,
        );
      }
      if (low > bodyLow) {
        push(
          "ohlc.low_above_body",
          "error",
          code,
          bar.date,
          `low(${low}) 高于 open/close 的最小值(${bodyLow})`,
        );
      }
    }

    if (!Number.isFinite(bar.volume)) {
      push("volume.negative", "error", code, bar.date, `volume 不是有限数值：${bar.volume}`);
    } else if (bar.volume < 0) {
      push("volume.negative", "error", code, bar.date, `volume 为负数：${bar.volume}`);
    } else if (bar.volume === 0) {
      push("volume.zero", "warning", code, bar.date, "volume 为 0，可能是停牌或无成交");
    }

    if (!Number.isFinite(bar.amount)) {
      push("amount.negative", "error", code, bar.date, `amount 不是有限数值：${bar.amount}`);
    } else if (bar.amount < 0) {
      push("amount.negative", "error", code, bar.date, `amount 为负数：${bar.amount}`);
    }
  });

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    barCount: bars.length,
    issues,
  };
}
