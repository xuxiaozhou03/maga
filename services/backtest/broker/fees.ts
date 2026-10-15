/**
 * 交易费用计算。
 *
 * ETF 默认无印花税与过户费，但保留可配置字段以支持其他品种。
 * 费用只在本模块计算一次，策略无法自定义（对应 PRD 2.3 / 6.2）。
 */

import { roundMoney } from "@/lib/math";
import type { FeeConfig, OrderSide } from "@/services/backtest/types";

export type FeeBreakdown = {
  commission: number;
  stampDuty: number;
  transferFee: number;
  total: number;
};

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`fees: ${label} 必须是非负有限数值，收到 ${value}`);
  }
}

export function assertFeeConfig(config: FeeConfig): void {
  assertNonNegative(config.commissionRate, "commissionRate");
  assertNonNegative(config.minCommission, "minCommission");
  assertNonNegative(config.stampDutyRate, "stampDutyRate");
  assertNonNegative(config.transferFeeRate, "transferFeeRate");
}

/**
 * 计算单笔费用明细。
 *
 * - 佣金 = max(成交金额 × 费率, 最低佣金)；
 * - 印花税仅卖出收取；
 * - 过户费按成交金额计。
 */
export function breakdownFee(
  amount: number,
  side: OrderSide,
  config: FeeConfig,
): FeeBreakdown {
  assertFeeConfig(config);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`fees: 成交金额必须是非负有限数值，收到 ${amount}`);
  }

  if (amount === 0) {
    return { commission: 0, stampDuty: 0, transferFee: 0, total: 0 };
  }

  const commission = roundMoney(Math.max(amount * config.commissionRate, config.minCommission));
  const stampDuty = side === "sell" ? roundMoney(amount * config.stampDutyRate) : 0;
  const transferFee = roundMoney(amount * config.transferFeeRate);

  return {
    commission,
    stampDuty,
    transferFee,
    total: roundMoney(commission + stampDuty + transferFee),
  };
}

/** 计算单笔费用总额。 */
export function calculateFee(amount: number, side: OrderSide, config: FeeConfig): number {
  return breakdownFee(amount, side, config).total;
}
