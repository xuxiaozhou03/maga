export interface Etf {
  code: string;
  name: string;
  trackingIndex: string;
  trackIndex: string;
  scale: number;
  /// 溢价率（百分数，例如 0.02 表示 0.02%）；上游可能为空
  premiumRate?: number | null;
  category: string;
}

export type EtfWithoutCategory = Omit<Etf, "category">;

export const magaCodes = [
  "NDX.GI",
  "SPTR500N.SPI",
  "NDXTMC.GI",
  "SPX.GI",
  "DJI.GI",
  "750108.MI",
  "NBI.GI",
  "SPSIBI.SPI",
  "SP5CSSUP.SPI",
];
