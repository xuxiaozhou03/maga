import { EtfCategoryName } from "./task/etf-categories";

export interface Etf {
  code: string;
  name: string;
  trackingIndex: string;
  trackIndex: string;
  scale: number;
  /// 溢价率（百分数，例如 0.02 表示 0.02%）；上游可能为空
  premiumRate?: number | null;
  category: EtfCategoryName;
}
