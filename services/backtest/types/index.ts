/**
 * 回测核心类型。
 *
 * 对应 PRD 13.1 / 13.4：策略只表达交易意图，订单校验、成交、费用、
 * 资金与持仓核算全部由引擎负责。
 */

import type { Ymd } from "@/lib/dates";

export type { Ymd };

export type OrderSide = "buy" | "sell";

/** 策略返回的交易意图。 */
export type OrderIntent = {
  code: string;
  side: OrderSide;
  /** 绝对数量（份）。与 `percent` 二选一。 */
  quantity?: number;
  /** 仓位比例，取值 0~1：买入按总资产折算，卖出按当前持仓折算。与 `quantity` 二选一。 */
  percent?: number;
  /** 策略侧理由，仅用于记录。 */
  reason?: string;
};

export type StrategyResult = {
  orders?: readonly OrderIntent[];
  logs?: readonly string[];
};

export type OrderStatus = "filled" | "rejected";

export type RejectReason =
  | "unknown_code"
  | "invalid_intent"
  | "lot_size"
  | "insufficient_cash"
  | "insufficient_position"
  | "invalid_price"
  | "zero_quantity";

export type OrderRecord = {
  date: Ymd;
  code: string;
  side: OrderSide;
  requestedQuantity: number;
  executedQuantity: number;
  /** 成交价，未成交时为当日收盘价（供诊断）。 */
  price: number;
  /** 成交金额。 */
  amount: number;
  fee: number;
  status: OrderStatus;
  reason: RejectReason | null;
  strategyReason: string | null;
  /** 卖出成交的已实现盈亏（按加权平均成本，已扣本次费用）。 */
  realizedPnl: number | null;
};

export type FeeConfig = {
  /** 佣金费率，按成交金额计。 */
  commissionRate: number;
  /** 单笔最低佣金（元）。 */
  minCommission: number;
  /** 印花税费率，A 股 ETF 通常为 0。 */
  stampDutyRate: number;
  /** 过户费费率，ETF 通常为 0。 */
  transferFeeRate: number;
};

export type TradingConfig = {
  /** 交易单位，ETF 为 100 份。 */
  lotSize: number;
};

/** ETF 默认费用：佣金万三、最低 5 元，无印花税与过户费。 */
export const DEFAULT_ETF_FEE: FeeConfig = {
  commissionRate: 0.0003,
  minCommission: 5,
  stampDutyRate: 0,
  transferFeeRate: 0,
};

/** ETF 默认交易单位：100 份。 */
export const DEFAULT_ETF_TRADING: TradingConfig = { lotSize: 100 };

export type BacktestConfig = {
  initialCash: number;
  startDate: Ymd;
  endDate: Ymd;
  /** 回测覆盖的 ETF 代码集合。 */
  codes: readonly string[];
  fee: FeeConfig;
  trading: TradingConfig;
  /** 同日订单的 ETF 处理优先级；未列出的代码排在最后。 */
  orderPriority?: readonly string[];
  /** 期末是否按最后一个交易日收盘价清仓。默认 false（按收盘价估值）。 */
  liquidateAtEnd?: boolean;
  /** 年化无风险利率，用于夏普比率。默认 0。 */
  riskFreeRate?: number;
};

export type PositionSnapshot = {
  code: string;
  quantity: number;
  averageCost: number;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
};

export type AccountSnapshot = {
  cash: number;
  marketValue: number;
  totalAssets: number;
  realizedPnl: number;
  unrealizedPnl: number;
  fees: number;
};

export type DailyRecord = {
  date: Ymd;
  cash: number;
  marketValue: number;
  totalAssets: number;
  realizedPnl: number;
  unrealizedPnl: number;
  fees: number;
  /** 日收益率；首日或数据不足时为 null。 */
  dailyReturn: number | null;
  /** 相对历史高点的回撤（负数或 0）；无法计算时为 null。 */
  drawdown: number | null;
  positions: PositionSnapshot[];
};

export type BacktestMetrics = {
  initialCash: number;
  finalCash: number;
  finalMarketValue: number;
  finalTotalAssets: number;
  totalReturn: number | null;
  annualizedReturn: number | null;
  maxDrawdown: number | null;
  annualizedVolatility: number | null;
  sharpeRatio: number | null;
  /** 成交笔数（status = filled）。 */
  tradeCount: number;
  winRate: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  totalFees: number;
  tradingDays: number;
  /** 指标为空时的原因说明，键为指标名。 */
  reasons: Record<string, string>;
};

export type MarketSeries = {
  code: string;
  /** 升序排列的 K 线，可包含回测区间之前的预热数据。 */
  bars: readonly {
    code: string;
    date: Ymd;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    amount: number;
  }[];
};
