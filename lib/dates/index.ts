/**
 * 日期工具。
 *
 * 项目内所有行情日期统一使用 `YYYYMMDD` 整数表示，与 `kline.date` 字段保持一致。
 */

export type Ymd = number;

const MIN_YMD = 19000101;
const MAX_YMD = 29991231;

/** 判断一个值是否是合法的 `YYYYMMDD` 整数（含日历校验）。 */
export function isValidYmd(value: unknown): value is Ymd {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  if (value < MIN_YMD || value > MAX_YMD) return false;

  const year = Math.floor(value / 10000);
  const month = Math.floor((value % 10000) / 100);
  const day = value % 100;

  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

/**
 * 把 `YYYYMMDD` 整数解析为 UTC 日期三元组；非法输入返回 `null`。
 */
export function parseYmd(value: Ymd): { year: number; month: number; day: number } | null {
  if (!isValidYmd(value)) return null;
  return {
    year: Math.floor(value / 10000),
    month: Math.floor((value % 10000) / 100),
    day: value % 100,
  };
}

/** 把 `YYYY-MM-DD` 或 `YYYY/MM/DD` 字符串转换为 `YYYYMMDD` 整数；非法输入返回 `null`。 */
export function toYmd(input: string): Ymd | null {
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(input.trim());
  if (!match) return null;
  const ymd = Number(`${match[1]}${match[2]}${match[3]}`);
  return isValidYmd(ymd) ? ymd : null;
}

/** 把 `YYYYMMDD` 整数格式化为 `YYYY-MM-DD`；非法输入返回 `null`。 */
export function formatYmd(value: Ymd): string | null {
  const parsed = parseYmd(value);
  if (!parsed) return null;
  const { year, month, day } = parsed;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
