export interface Bar {
  code: string;
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  change: number;
  changePercent: number;
}

export interface ValuationSnap {
  value: number;
  percent: number;
}

export interface Fill {
  code: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  fee: number;
  date: number;
}

export interface Context {
  readonly date: number;
  readonly codes: string[];
  readonly equity: number;
  readonly cash: number;
  readonly positions: Record<string, number>;
  readonly targetWeights: Record<string, number>;
  getBars(code: string, lookback?: number): Bar[];
  getValuation(
    code: string,
    type: "PE" | "PB" | "PS" | "DID",
    date: number,
  ): ValuationSnap | null;
  getFeature(code: string, name: string): number | null;
  setTargetWeight(weights: Record<string, number>): void;
  order(code: string, side: "buy" | "sell", shares: number): void;
  log(message: string): void;
}

export interface Strategy {
  initialize?(params: Record<string, unknown>): void;
  handleBar(context: Context): void;
  onOrder?(fill: Fill): void;
}

export interface BacktestConfig {
  commissionRate: number;
  minCommission: number;
  slippage: number;
}

export interface RunBacktestInput {
  strategyKey: string;
  params: Record<string, unknown>;
  codes: string[];
  startDate: number;
  endDate: number;
  config?: Partial<BacktestConfig>;
  initialCash?: number;
  runId?: string;
}
