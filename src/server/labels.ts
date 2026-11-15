import type { AppConfig } from "../config/loader.js";
import type { RankingCode } from "../domain/rankings.js";
import type { TaskStatus } from "../domain/task.js";

export const SERVICE_VERSION = "0.5.1";

export const RANKING_LABELS: Record<RankingCode, string> = {
  return_1d: "1D 收益",
  return_5d: "5D 收益",
  return_20d: "20D 收益",
  return_60d: "60D 收益",
  return_120d: "120D 收益",
  return_250d: "250D 收益",
  return_ytd: "YTD 收益",
  risk_score: "风险得分",
  trend_score: "趋势得分",
  valuation_pe: "PE 百分位",
  valuation_pb: "PB 百分位",
  valuation_ps: "PS 百分位",
  activity_amount_20d: "20D 均额",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "等待中",
  running: "运行中",
  success: "成功",
  partial_success: "部分成功",
  failed: "失败",
  skipped: "已跳过",
};

export const MARKET_STATE_LABELS: Record<string, string> = {
  risk_rising: "风险抬升",
  weak: "弱势",
  strong: "强势",
  diverging: "分化",
  activity_improving: "活跃度改善",
  neutral: "中性",
};

export const SEVERITY_LABELS = {
  info: "提示",
  warning: "警告",
  critical: "严重",
} as const;

export function dataStatusLabel(status: "complete" | "partial"): string {
  return status === "complete" ? "完整" : "部分数据";
}

export function categoryLabel(
  config: AppConfig["categories"],
  primaryCode: string | null,
  secondaryCode: string | null,
): string {
  if (primaryCode === null) {
    return "待确认";
  }
  const primary = config.categories.find((item) => item.code === primaryCode);
  if (!primary) {
    return secondaryCode ?? primaryCode;
  }
  if (secondaryCode === null) {
    return primary.name;
  }
  const secondary = primary.children.find((item) => item.code === secondaryCode);
  return `${primary.name} / ${secondary?.name ?? secondaryCode}`;
}
