import { describe, expect, it } from "vitest";
import {
  floorToLot,
  isValidBuyQuantity,
  isValidSellQuantity,
  maxAffordableBuyQuantity,
} from "@/services/backtest/broker/lot";
import type { FeeConfig } from "@/services/backtest/types";

const FREE_FEE: FeeConfig = {
  commissionRate: 0,
  minCommission: 0,
  stampDutyRate: 0,
  transferFeeRate: 0,
};

const ETF_FEE: FeeConfig = { ...FREE_FEE, commissionRate: 0.0003, minCommission: 5 };

describe("floorToLot", () => {
  it("向下取整到整手", () => {
    expect(floorToLot(1050, 100)).toBe(1000);
    expect(floorToLot(100, 100)).toBe(100);
    expect(floorToLot(50, 100)).toBe(0);
    expect(floorToLot(0, 100)).toBe(0);
  });
});

describe("isValidBuyQuantity", () => {
  it("只接受整手正整数", () => {
    expect(isValidBuyQuantity(100, 100)).toBe(true);
    expect(isValidBuyQuantity(150, 100)).toBe(false);
    expect(isValidBuyQuantity(0, 100)).toBe(false);
    expect(isValidBuyQuantity(-100, 100)).toBe(false);
  });
});

describe("isValidSellQuantity", () => {
  it("整手或全额清仓都合法", () => {
    expect(isValidSellQuantity(100, 100, 150)).toBe(true);
    expect(isValidSellQuantity(150, 100, 150)).toBe(true); // 零股一次性清仓
    expect(isValidSellQuantity(50, 100, 150)).toBe(false); // 部分零股不合法
    expect(isValidSellQuantity(200, 100, 150)).toBe(false); // 超过持仓
    expect(isValidSellQuantity(0, 100, 150)).toBe(false);
  });
});

describe("maxAffordableBuyQuantity", () => {
  it("无费用时按现金买满整手", () => {
    expect(maxAffordableBuyQuantity(2000, 10, 100, FREE_FEE)).toBe(200);
  });

  it("计入最低佣金后买不满整手时返回 0", () => {
    expect(maxAffordableBuyQuantity(1000, 10, 100, ETF_FEE)).toBe(0);
    expect(maxAffordableBuyQuantity(1005, 10, 100, ETF_FEE)).toBe(100);
  });

  it("费用导致超出上限时回退一手", () => {
    // 2 手需 2000 + 5 = 2005 > 2000，回退到 1 手
    expect(maxAffordableBuyQuantity(2000, 10, 100, ETF_FEE)).toBe(100);
  });

  it("对非法价格或现金返回 0", () => {
    expect(maxAffordableBuyQuantity(1000, 0, 100, FREE_FEE)).toBe(0);
    expect(maxAffordableBuyQuantity(0, 10, 100, FREE_FEE)).toBe(0);
    expect(maxAffordableBuyQuantity(-1, 10, 100, FREE_FEE)).toBe(0);
  });
});
