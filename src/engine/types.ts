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

export abstract class Strategy {
  /** 策略唯一标识（静态，由子类提供） */
  static key: string;
  static name: string;
  static description: string;
  static paramsSchema: Record<
    string,
    { type: string; default?: unknown; desc?: string }
  >;

  /** 初始化，子类可覆盖 */
  initialize(_params: Record<string, unknown>): void {}

  /** 每个交易日调用，子类必须实现 */
  abstract handleBar(context: Context): void;

  /** 成交回调，子类可覆盖 */
  onOrder?(_fill: Fill): void;
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
