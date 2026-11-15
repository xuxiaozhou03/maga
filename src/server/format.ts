export const MISSING_VALUE = "—";

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return MISSING_VALUE;
  }
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return MISSING_VALUE;
  }
  return `${formatNumber(value * 100, digits)}%`;
}

export function formatBps(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return MISSING_VALUE;
  }
  return `${formatNumber(value * 100, digits)}%`;
}

export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return MISSING_VALUE;
  }
  if (Math.abs(value) >= 100_000_000) {
    return `${formatNumber(value / 100_000_000, 2)} 亿`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${formatNumber(value / 10_000, 2)} 万`;
  }
  return formatNumber(value, 0);
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return MISSING_VALUE;
  }
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  return value ?? MISSING_VALUE;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return MISSING_VALUE;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRank(rank: number | null | undefined): string {
  return rank === null || rank === undefined ? MISSING_VALUE : `#${rank}`;
}

export function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
