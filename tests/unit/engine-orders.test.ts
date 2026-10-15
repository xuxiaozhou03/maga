import { describe, expect, it } from "vitest";
import { executeOrder } from "@/services/backtest/broker/orders";
import { sortOrderIntents } from "@/services/backtest/engine/engine";
import { Portfolio } from "@/services/backtest/portfolio/portfolio";
import type { BacktestConfig, OrderIntent } from "@/services/backtest/types";

const config: BacktestConfig = {
  initialCash: 10_000,
  startDate: 20240101,
  endDate: 20240131,
  codes: ["510300.SH", "513100.SH"],
  fee: { commissionRate: 0, minCommission: 0, stampDutyRate: 0, transferFeeRate: 0 },
  trading: { lotSize: 100 },
  orderPriority: ["513100.SH", "510300.SH"],
};

const knownCodes = new Set(config.codes);

function run(intent: OrderIntent, price: number | undefined, portfolio = new Portfolio(10_000)) {
  return {
    portfolio,
    record: executeOrder({
      date: 20240102,
      intent,
      price,
      totalAssets: portfolio.getCash(),
      config,
      portfolio,
      knownCodes,
    }),
  };
}

describe("sortOrderIntents", () => {
  it("按配置的 ETF 优先级处理", () => {
    const sorted = sortOrderIntents(
      [
        { code: "510300.SH", side: "buy" },
        { code: "513100.SH", side: "buy" },
      ],
      config.orderPriority,
    );
    expect(sorted.map((intent) => intent.code)).toEqual(["513100.SH", "510300.SH"]);
  });

  it("同一 ETF 先卖后买", () => {
    const sorted = sortOrderIntents(
      [
        { code: "510300.SH", side: "buy" },
        { code: "510300.SH", side: "sell" },
      ],
      config.orderPriority,
    );
    expect(sorted.map((intent) => intent.side)).toEqual(["sell", "buy"]);
  });

  it("未列出的 ETF 排在最后，其余保持原顺序", () => {
    const sorted = sortOrderIntents(
      [
        { code: "999999.XX", side: "buy" },
        { code: "510300.SH", side: "buy" },
      ],
      config.orderPriority,
    );
    expect(sorted.map((intent) => intent.code)).toEqual(["510300.SH", "999999.XX"]);
  });
});

describe("executeOrder", () => {
  it("买入成交后更新账户", () => {
    const { portfolio, record } = run({ code: "510300.SH", side: "buy", quantity: 100 }, 10);
    expect(record.status).toBe("filled");
    expect(record.executedQuantity).toBe(100);
    expect(record.amount).toBe(1000);
    expect(portfolio.getCash()).toBe(9000);
    expect(portfolio.getQuantity("510300.SH")).toBe(100);
  });

  it("拒绝不在回测集合内的 ETF", () => {
    expect(run({ code: "NOPE.XX", side: "buy", quantity: 100 }, 10).record.reason).toBe(
      "unknown_code",
    );
  });

  it("拒绝缺失或非法价格", () => {
    expect(run({ code: "510300.SH", side: "buy", quantity: 100 }, undefined).record.reason).toBe(
      "invalid_price",
    );
    expect(run({ code: "510300.SH", side: "buy", quantity: 100 }, 0).record.reason).toBe(
      "invalid_price",
    );
  });

  it("拒绝同时提供 quantity 与 percent", () => {
    expect(
      run({ code: "510300.SH", side: "buy", quantity: 100, percent: 0.5 }, 10).record.reason,
    ).toBe("invalid_intent");
  });

  it("拒绝非整手买入", () => {
    expect(run({ code: "510300.SH", side: "buy", quantity: 150 }, 10).record.reason).toBe(
      "lot_size",
    );
  });

  it("拒绝资金不足的买入", () => {
    expect(run({ code: "510300.SH", side: "buy", quantity: 2000 }, 10).record.reason).toBe(
      "insufficient_cash",
    );
  });

  it("拒绝无持仓的卖出", () => {
    expect(run({ code: "510300.SH", side: "sell", quantity: 100 }, 10).record.reason).toBe(
      "insufficient_position",
    );
  });

  it("percent=1 卖出全部持仓并记录已实现盈亏", () => {
    const portfolio = new Portfolio(10_000);
    const buy = executeOrder({
      date: 20240102,
      intent: { code: "510300.SH", side: "buy", quantity: 100 },
      price: 10,
      totalAssets: 10_000,
      config,
      portfolio,
      knownCodes,
    });
    expect(buy.status).toBe("filled");

    const sell = executeOrder({
      date: 20240103,
      intent: { code: "510300.SH", side: "sell", percent: 1 },
      price: 12,
      totalAssets: 10_200,
      config,
      portfolio,
      knownCodes,
    });

    expect(sell.status).toBe("filled");
    expect(sell.executedQuantity).toBe(100);
    expect(sell.realizedPnl).toBe(200);
    expect(portfolio.getQuantity("510300.SH")).toBe(0);
  });

  it("percent 买入按总资产折算并取整到整手", () => {
    // 总资产 10000 × 0.5 = 5000，价格 10 → 500 份
    const { record } = run({ code: "510300.SH", side: "buy", percent: 0.5 }, 10);
    expect(record.status).toBe("filled");
    expect(record.executedQuantity).toBe(500);
  });
});
