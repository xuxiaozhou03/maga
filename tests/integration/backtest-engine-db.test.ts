import { afterAll, describe, expect, it } from "vitest";
import { moneyEquals } from "@/lib/math";
import { prisma } from "@/services/prisma";
import { runBacktestOnDatabase } from "@/services/backtest/engine/data";
import { buyAndHoldStrategy } from "@/services/backtest/engine/builtin-strategies";
import { getKlineFingerprint } from "@/services/repositories/kline.repository";
import {
  DEFAULT_ETF_FEE,
  DEFAULT_ETF_TRADING,
  type BacktestConfig,
} from "@/services/backtest/types";

const CODE = "510300.SH";

const config: BacktestConfig = {
  initialCash: 100_000,
  startDate: 20240102,
  endDate: 20241231,
  codes: [CODE],
  fee: DEFAULT_ETF_FEE,
  trading: DEFAULT_ETF_TRADING,
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe("runBacktestOnDatabase", () => {
  it("用真实行情跑通买入持有，账务自洽", async () => {
    const result = await runBacktestOnDatabase(buyAndHoldStrategy, config, 60);

    expect(result.dailyRecords.length).toBeGreaterThan(200);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].status).toBe("filled");
    expect(result.metrics.tradeCount).toBe(1);
    expect(result.metrics.totalFees).toBeGreaterThan(0);
    expect(result.metrics.finalTotalAssets).toBeGreaterThan(0);

    for (const record of result.dailyRecords) {
      expect(moneyEquals(record.totalAssets, record.cash + record.marketValue)).toBe(true);
      expect(record.cash).toBeGreaterThanOrEqual(0);
      expect(record.totalAssets).toBeGreaterThan(0);
    }
  });

  it("相同配置重复回测结果完全一致", async () => {
    const first = await runBacktestOnDatabase(buyAndHoldStrategy, config, 60);
    const second = await runBacktestOnDatabase(buyAndHoldStrategy, config, 60);

    expect(first.metrics.finalTotalAssets).toBe(second.metrics.finalTotalAssets);
    expect(first.metrics.totalReturn).toBe(second.metrics.totalReturn);
    expect(first.metrics.maxDrawdown).toBe(second.metrics.maxDrawdown);
    expect(first.dailyRecords.map((record) => record.totalAssets)).toEqual(
      second.dailyRecords.map((record) => record.totalAssets),
    );
  });

  it("支持多 ETF 回测", async () => {
    const multi: BacktestConfig = { ...config, codes: ["513100.SH", "510300.SH"] };
    const result = await runBacktestOnDatabase(buyAndHoldStrategy, multi, 30);

    expect(result.dailyRecords.length).toBeGreaterThan(200);
    for (const record of result.dailyRecords) {
      expect(moneyEquals(record.totalAssets, record.cash + record.marketValue)).toBe(true);
    }
  });

  it("数据指纹稳定且随区间变化", async () => {
    const a = await getKlineFingerprint({
      code: CODE,
      startDate: config.startDate,
      endDate: config.endDate,
    });
    const b = await getKlineFingerprint({
      code: CODE,
      startDate: config.startDate,
      endDate: config.endDate,
    });
    const other = await getKlineFingerprint({ code: CODE, startDate: 20240102, endDate: 20240131 });

    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });
});
