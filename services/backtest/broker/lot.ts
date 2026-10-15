/**
 * 交易单位（手）规则。
 *
 * A 股 ETF 以 100 份为一手：买入必须是整手；卖出也应是整手，
 * 但清仓时可以一次性卖出剩余的零股（对应 PRD 6.2）。
 */

import type { FeeConfig } from "@/services/backtest/types";
import { calculateFee } from "./fees";

export function assertLotSize(lotSize: number): void {
  if (!Number.isInteger(lotSize) || lotSize <= 0) {
    throw new RangeError(`lot: lotSize 必须是正整数，收到 ${lotSize}`);
  }
}

/** 数量是否为合法正数。 */
export function isPositiveQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0;
}

/** 向下取整到整手。 */
export function floorToLot(quantity: number, lotSize: number): number {
  assertLotSize(lotSize);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.floor(quantity / lotSize) * lotSize;
}

/** 买入数量必须是整手。 */
export function isValidBuyQuantity(quantity: number, lotSize: number): boolean {
  assertLotSize(lotSize);
  return isPositiveQuantity(quantity) && quantity % lotSize === 0;
}

/**
 * 卖出数量校验：整手，或等于当前全部持仓（允许零股清仓）。
 */
export function isValidSellQuantity(
  quantity: number,
  lotSize: number,
  positionQuantity: number,
): boolean {
  assertLotSize(lotSize);
  if (!isPositiveQuantity(quantity)) return false;
  if (quantity > positionQuantity) return false;
  if (quantity === positionQuantity) return true;
  return quantity % lotSize === 0;
}

/**
 * 在现金约束下，能买到的最大整手数量（已计入费用，含最低佣金）。
 * 买不起一手时返回 0。
 */
export function maxAffordableBuyQuantity(
  cash: number,
  price: number,
  lotSize: number,
  feeConfig: FeeConfig,
): number {
  assertLotSize(lotSize);
  if (!Number.isFinite(cash) || cash <= 0) return 0;
  if (!Number.isFinite(price) || price <= 0) return 0;

  // 忽略费用时的上界，再逐手回退到真正买得起的数量。
  let lots = Math.floor(cash / (price * lotSize));
  while (lots > 0) {
    const quantity = lots * lotSize;
    const amount = quantity * price;
    const fee = calculateFee(amount, "buy", feeConfig);
    if (amount + fee <= cash + 1e-9) return quantity;
    lots -= 1;
  }
  return 0;
}
