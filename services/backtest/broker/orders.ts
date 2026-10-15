/**
 * 订单校验与撮合。
 *
 * 策略只返回交易意图；数量解析、交易单位校验、费用计算、
 * 资金/持仓检查与账户变更都在这里完成（对应 PRD 6.2 / 13.3）。
 */

import { roundMoney } from "@/lib/math";
import type {
  BacktestConfig,
  OrderIntent,
  OrderRecord,
  RejectReason,
  Ymd,
} from "@/services/backtest/types";
import type { Portfolio } from "@/services/backtest/portfolio/portfolio";
import { calculateFee } from "./fees";
import {
  floorToLot,
  isPositiveQuantity,
  isValidBuyQuantity,
  isValidSellQuantity,
  maxAffordableBuyQuantity,
} from "./lot";

export type ExecuteOrderInput = {
  date: Ymd;
  intent: OrderIntent;
  /** 当日成交价（收盘价模型）；缺失或非法时拒绝成交。 */
  price: number | undefined;
  /** 决策时点的总资产，用于 `percent` 买入折算。 */
  totalAssets: number;
  config: BacktestConfig;
  portfolio: Portfolio;
  knownCodes: ReadonlySet<string>;
};

export function executeOrder(input: ExecuteOrderInput): OrderRecord {
  const { intent, price, totalAssets, config, portfolio, knownCodes } = input;
  const { lotSize } = config.trading;

  const make = (
    overrides: Partial<OrderRecord> & { status: OrderRecord["status"] },
  ): OrderRecord => ({
    date: input.date,
    code: intent.code,
    side: intent.side,
    requestedQuantity: 0,
    executedQuantity: 0,
    price: Number.isFinite(price) ? (price as number) : 0,
    amount: 0,
    fee: 0,
    reason: null,
    strategyReason: intent.reason ?? null,
    realizedPnl: null,
    ...overrides,
  });

  const reject = (reason: RejectReason, requestedQuantity = 0): OrderRecord =>
    make({ status: "rejected", reason, requestedQuantity });

  if (!knownCodes.has(intent.code)) return reject("unknown_code");
  if (!Number.isFinite(price) || (price as number) <= 0) return reject("invalid_price");
  if (intent.side !== "buy" && intent.side !== "sell") return reject("invalid_intent");

  const hasQuantity = intent.quantity !== undefined;
  const hasPercent = intent.percent !== undefined;
  if (hasQuantity === hasPercent) return reject("invalid_intent");

  const barPrice = price as number;
  const held = portfolio.getQuantity(intent.code);
  let quantity = 0;

  if (hasQuantity) {
    const requested = intent.quantity as number;
    if (!isPositiveQuantity(requested)) {
      return reject(requested <= 0 ? "zero_quantity" : "invalid_intent", requested);
    }

    if (intent.side === "buy") {
      if (!isValidBuyQuantity(requested, lotSize)) return reject("lot_size", requested);
    } else if (!isValidSellQuantity(requested, lotSize, held)) {
      return reject(held < requested ? "insufficient_position" : "lot_size", requested);
    }

    quantity = requested;
  } else {
    const percent = intent.percent as number;
    if (!Number.isFinite(percent) || percent <= 0 || percent > 1) {
      return reject("invalid_intent");
    }

    if (intent.side === "buy") {
      const budget = Math.min(portfolio.getCash(), totalAssets * percent);
      quantity = maxAffordableBuyQuantity(budget, barPrice, lotSize, config.fee);
      if (quantity === 0) {
        const oneLot = barPrice * lotSize;
        return reject(portfolio.getCash() < oneLot ? "insufficient_cash" : "zero_quantity");
      }
    } else {
      quantity = percent >= 1 ? held : floorToLot(held * percent, lotSize);
      if (quantity === 0) return reject(held === 0 ? "insufficient_position" : "zero_quantity");
      if (quantity > held) return reject("insufficient_position", quantity);
    }
  }

  const amount = roundMoney(barPrice * quantity);
  const fee = calculateFee(amount, intent.side, config.fee);

  if (intent.side === "buy") {
    const cost = portfolio.buyCost(barPrice, quantity, fee);
    if (!portfolio.canAfford(cost)) return reject("insufficient_cash", quantity);

    portfolio.applyBuy(intent.code, quantity, barPrice, fee);
    return make({
      status: "filled",
      requestedQuantity: quantity,
      executedQuantity: quantity,
      amount,
      fee,
    });
  }

  if (!portfolio.canSell(intent.code, quantity)) return reject("insufficient_position", quantity);

  const realizedPnl = portfolio.applySell(intent.code, quantity, barPrice, fee);
  return make({
    status: "filled",
    requestedQuantity: quantity,
    executedQuantity: quantity,
    amount,
    fee,
    realizedPnl,
  });
}
