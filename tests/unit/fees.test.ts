import { describe, expect, it } from "vitest";
import { breakdownFee, calculateFee } from "@/services/backtest/broker/fees";
import type { FeeConfig } from "@/services/backtest/types";

const ETF_FEE: FeeConfig = {
  commissionRate: 0.0003,
  minCommission: 5,
  stampDutyRate: 0,
  transferFeeRate: 0,
};

describe("calculateFee", () => {
  it("佣金低于最低值时按最低佣金收取", () => {
    // 10000 × 0.0003 = 3 < 5
    expect(calculateFee(10_000, "buy", ETF_FEE)).toBe(5);
  });

  it("佣金高于最低值时按费率收取", () => {
    // 100000 × 0.0003 = 30
    expect(calculateFee(100_000, "buy", ETF_FEE)).toBe(30);
  });

  it("ETF 无印花税时买卖费用一致", () => {
    expect(calculateFee(100_000, "sell", ETF_FEE)).toBe(30);
  });

  it("印花税仅卖出收取", () => {
    const config: FeeConfig = { ...ETF_FEE, stampDutyRate: 0.001 };
    expect(breakdownFee(100_000, "buy", config).stampDuty).toBe(0);
    expect(breakdownFee(100_000, "sell", config).stampDuty).toBe(100);
    expect(calculateFee(100_000, "sell", config)).toBe(130);
  });

  it("过户费按成交金额计", () => {
    const config: FeeConfig = { ...ETF_FEE, transferFeeRate: 0.00001 };
    expect(calculateFee(100_000, "buy", config)).toBe(31);
  });

  it("成交金额为 0 时返回 0", () => {
    expect(calculateFee(0, "buy", ETF_FEE)).toBe(0);
  });

  it("对非法费用配置抛出异常", () => {
    expect(() => calculateFee(100, "buy", { ...ETF_FEE, commissionRate: -1 })).toThrow(RangeError);
    expect(() => calculateFee(100, "buy", { ...ETF_FEE, minCommission: NaN })).toThrow(RangeError);
  });

  it("对非法成交金额抛出异常", () => {
    expect(() => calculateFee(-1, "buy", ETF_FEE)).toThrow(RangeError);
  });
});
