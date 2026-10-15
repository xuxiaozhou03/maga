import { describe, expect, it } from "vitest";
import { Portfolio } from "@/services/backtest/portfolio/portfolio";
import { moneyEquals } from "@/lib/math";

function prices(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

describe("Portfolio", () => {
  it("初始状态只有现金", () => {
    const portfolio = new Portfolio(10_000);
    expect(portfolio.getCash()).toBe(10_000);
    expect(portfolio.getTotalFees()).toBe(0);
    expect(portfolio.getHeldCodes()).toEqual([]);
  });

  it("买入后现金减少、持仓成本含买入费用", () => {
    const portfolio = new Portfolio(10_000);
    portfolio.applyBuy("510300.SH", 100, 10, 5);

    expect(portfolio.getCash()).toBe(8995);
    const position = portfolio.getPosition("510300.SH");
    expect(position?.quantity).toBe(100);
    expect(moneyEquals(position?.averageCost ?? 0, 10.05)).toBe(true);
    expect(position?.costBasis).toBe(1005);
  });

  it("卖出按加权平均成本结转，并计入卖出费用", () => {
    const portfolio = new Portfolio(10_000);
    portfolio.applyBuy("510300.SH", 100, 10, 5);
    const realized = portfolio.applySell("510300.SH", 100, 12, 5);

    // 净收入 1200 - 5 = 1195，成本 1005，实现盈亏 190
    expect(realized).toBe(190);
    expect(portfolio.getCash()).toBe(10_190);
    expect(portfolio.getPosition("510300.SH")).toBeNull();
    expect(portfolio.getTotalFees()).toBe(10);
  });

  it("部分卖出后按比例结转成本，均价不变", () => {
    const portfolio = new Portfolio(10_000);
    portfolio.applyBuy("510300.SH", 200, 10, 0);
    portfolio.applySell("510300.SH", 100, 12, 0);

    const position = portfolio.getPosition("510300.SH");
    expect(position?.quantity).toBe(100);
    expect(moneyEquals(position?.averageCost ?? 0, 10)).toBe(true);
    expect(position?.costBasis).toBe(1000);
    // 10000 - 2000（买入）+ 1200（卖出 100 份） = 9200
    expect(portfolio.getCash()).toBe(9200);
  });

  it("总资产恒等于现金 + 持仓市值，也等于初始资金 + 已实现 + 未实现", () => {
    const portfolio = new Portfolio(10_000);
    portfolio.applyBuy("510300.SH", 100, 10, 5);
    const snap = portfolio.markToMarket(20240102, prices({ "510300.SH": 11 }));

    expect(moneyEquals(snap.account.totalAssets, snap.account.cash + snap.account.marketValue)).toBe(
      true,
    );
    expect(
      moneyEquals(
        snap.account.totalAssets,
        10_000 + snap.account.realizedPnl + snap.account.unrealizedPnl,
      ),
    ).toBe(true);
    // 市值 1100 - 成本 1005 = 95
    expect(snap.account.unrealizedPnl).toBe(95);
    expect(snap.account.totalAssets).toBe(10_095);
  });

  it("全部卖出后未实现盈亏归零，总资产等于现金", () => {
    const portfolio = new Portfolio(10_000);
    portfolio.applyBuy("510300.SH", 100, 10, 5);
    portfolio.applySell("510300.SH", 100, 9, 5);
    const snap = portfolio.markToMarket(20240103, prices({}));

    expect(snap.account.marketValue).toBe(0);
    expect(snap.account.unrealizedPnl).toBe(0);
    expect(snap.account.totalAssets).toBe(snap.account.cash);
    expect(
      moneyEquals(snap.account.totalAssets, 10_000 + snap.account.realizedPnl),
    ).toBe(true);
  });

  it("拒绝超出现金的买入", () => {
    const portfolio = new Portfolio(1000);
    expect(() => portfolio.applyBuy("510300.SH", 100, 10, 5)).toThrow(RangeError);
  });

  it("拒绝超出持仓的卖出", () => {
    const portfolio = new Portfolio(10_000);
    portfolio.applyBuy("510300.SH", 100, 10, 0);
    expect(() => portfolio.applySell("510300.SH", 200, 10, 0)).toThrow(RangeError);
  });

  it("拒绝非法初始资金与非法数量", () => {
    expect(() => new Portfolio(-1)).toThrow(RangeError);
    const portfolio = new Portfolio(10_000);
    expect(() => portfolio.applyBuy("510300.SH", 0, 10, 0)).toThrow(RangeError);
    expect(() => portfolio.applyBuy("510300.SH", 10.5, 10, 0)).toThrow(RangeError);
  });

  it("缺少价格时按成本估值，不会凭空产生盈亏", () => {
    const portfolio = new Portfolio(10_000);
    portfolio.applyBuy("510300.SH", 100, 10, 5);
    const snap = portfolio.markToMarket(20240102, prices({}));

    expect(snap.account.marketValue).toBe(1005);
    expect(snap.account.unrealizedPnl).toBe(0);
  });
});
