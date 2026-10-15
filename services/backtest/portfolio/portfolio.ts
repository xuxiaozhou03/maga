/**
 * 资金与持仓核算。
 *
 * 约定（对应 PRD 13.4，并保证 `总资产 = 现金 + 持仓市值`）：
 * - 买入费用计入持仓成本，因此持仓均价含买入费用；
 * - 卖出时按加权平均成本结转成本，卖出费用从卖出收入中扣除；
 * - `realizedPnl` 为已实现净盈亏，`unrealizedPnl = 市值 - 持仓成本`。
 *
 * 恒等式：`totalAssets = initialCash + realizedPnl + unrealizedPnl`。
 */

import { roundMoney } from "@/lib/math";
import type { AccountSnapshot, PositionSnapshot, Ymd } from "@/services/backtest/types";

type PositionState = {
  code: string;
  quantity: number;
  /** 当前持仓对应的资金占用（含买入费用）。 */
  costBasis: number;
  realizedPnl: number;
};

export type ResolvedPosition = {
  code: string;
  quantity: number;
  /** 加权平均成本，含买入费用。 */
  averageCost: number;
  costBasis: number;
  realizedPnl: number;
};

export class Portfolio {
  private cash: number;
  private totalFees = 0;
  private readonly positions = new Map<string, PositionState>();

  constructor(public readonly initialCash: number) {
    if (!Number.isFinite(initialCash) || initialCash < 0) {
      throw new RangeError(`portfolio: 初始资金必须是非负数，收到 ${initialCash}`);
    }
    this.cash = roundMoney(initialCash);
  }

  getCash(): number {
    return this.cash;
  }

  getTotalFees(): number {
    return this.totalFees;
  }

  getQuantity(code: string): number {
    return this.positions.get(code)?.quantity ?? 0;
  }

  /** 返回持仓明细；无持仓（或已清仓）返回 null。 */
  getPosition(code: string): ResolvedPosition | null {
    const state = this.positions.get(code);
    if (!state || state.quantity === 0) return null;
    return {
      code: state.code,
      quantity: state.quantity,
      averageCost: roundMoney(state.costBasis / state.quantity),
      costBasis: state.costBasis,
      realizedPnl: state.realizedPnl,
    };
  }

  /** 全部有持仓的代码，按插入顺序。 */
  getHeldCodes(): string[] {
    return [...this.positions.values()]
      .filter((state) => state.quantity > 0)
      .map((state) => state.code);
  }

  /** 卖出可用数量等于当前持仓。 */
  canSell(code: string, quantity: number): boolean {
    return quantity > 0 && this.getQuantity(code) >= quantity;
  }

  /** 买入所需总额（含费用）。 */
  buyCost(price: number, quantity: number, fee: number): number {
    return roundMoney(price * quantity + fee);
  }

  canAfford(totalCost: number): boolean {
    return totalCost <= this.cash;
  }

  /**
   * 记录一笔买入。调用方需先完成数量与资金校验。
   */
  applyBuy(code: string, quantity: number, price: number, fee: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new RangeError(`portfolio: 买入数量必须为正整数，收到 ${quantity}`);
    }

    const cost = this.buyCost(price, quantity, fee);
    if (cost > this.cash) {
      throw new RangeError(
        `portfolio: 现金不足，需要 ${cost}，可用 ${this.cash}`,
      );
    }

    const state = this.positions.get(code) ?? {
      code,
      quantity: 0,
      costBasis: 0,
      realizedPnl: 0,
    };

    state.quantity += quantity;
    state.costBasis = roundMoney(state.costBasis + cost);
    this.positions.set(code, state);

    this.cash = roundMoney(this.cash - cost);
    this.totalFees = roundMoney(this.totalFees + fee);
  }

  /**
   * 记录一笔卖出，返回该笔的已实现净盈亏。
   * 调用方需先完成数量与持仓校验。
   */
  applySell(code: string, quantity: number, price: number, fee: number): number {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new RangeError(`portfolio: 卖出数量必须为正整数，收到 ${quantity}`);
    }

    const state = this.positions.get(code);
    if (!state || state.quantity < quantity) {
      throw new RangeError(
        `portfolio: 持仓不足，需要 ${quantity}，持有 ${state?.quantity ?? 0}`,
      );
    }

    const averageCost = state.costBasis / state.quantity;
    const costRemoved = roundMoney(averageCost * quantity);
    const netProceeds = roundMoney(price * quantity - fee);
    const realized = roundMoney(netProceeds - costRemoved);

    state.quantity -= quantity;
    state.realizedPnl = roundMoney(state.realizedPnl + realized);
    state.costBasis = state.quantity === 0 ? 0 : roundMoney(state.costBasis - costRemoved);

    this.cash = roundMoney(this.cash + netProceeds);
    this.totalFees = roundMoney(this.totalFees + fee);

    return realized;
  }

  /**
   * 按给定收盘价估值，返回账户与持仓快照。
   * 缺少价格的持仓按成本计（视为无法估值）。
   */
  markToMarket(date: Ymd, prices: ReadonlyMap<string, number>): {
    account: AccountSnapshot;
    positions: PositionSnapshot[];
  } {
    const positions: PositionSnapshot[] = [];
    let marketValue = 0;
    let totalCostBasis = 0;
    let realizedPnl = 0;

    for (const state of this.positions.values()) {
      if (state.quantity === 0 && state.realizedPnl === 0) continue;

      realizedPnl = roundMoney(realizedPnl + state.realizedPnl);

      if (state.quantity === 0) continue;

      const price = prices.get(state.code) ?? state.costBasis / state.quantity;
      const value = roundMoney(price * state.quantity);
      const unrealized = roundMoney(value - state.costBasis);

      marketValue = roundMoney(marketValue + value);
      totalCostBasis = roundMoney(totalCostBasis + state.costBasis);

      positions.push({
        code: state.code,
        quantity: state.quantity,
        averageCost: roundMoney(state.costBasis / state.quantity),
        marketValue: value,
        unrealizedPnl: unrealized,
        realizedPnl: state.realizedPnl,
      });
    }

    const unrealizedPnl = roundMoney(marketValue - totalCostBasis);
    const totalAssets = roundMoney(this.cash + marketValue);

    return {
      account: {
        cash: this.cash,
        marketValue,
        totalAssets,
        realizedPnl,
        unrealizedPnl,
        fees: this.totalFees,
      },
      positions,
    };
  }
}
