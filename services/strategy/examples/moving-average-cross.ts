/**
 * 示例策略：均线交叉。
 *
 * 短均线上穿长均线买入，下穿卖出，始终满仓或空仓。
 * 运行：pnpm strategy:run services/strategy/examples/moving-average-cross.ts --code 510300.SH
 */

import { sma, lastValue, valueAtOffset } from "@/services/backtest/indicators/indicators";
import { defineStrategy } from "@/services/strategy/types";

export type MaCrossParams = {
  code?: string;
  fast?: number;
  slow?: number;
};

type MaCrossState = {
  lastSignal: "golden" | "death" | null;
};

export const movingAverageCrossStrategy = defineStrategy<MaCrossParams, MaCrossState>({
  name: "均线交叉",
  description: "短均线上穿长均线买入，下穿卖出，始终满仓或空仓。",
  params: { fast: 5, slow: 20 },
  initialize: () => ({ lastSignal: null }),
  onBar(ctx, state) {
    const code = ctx.params.code ?? ctx.codes[0];
    const fast = ctx.params.fast ?? 5;
    const slow = ctx.params.slow ?? 20;

    if (!ctx.codes.includes(code)) {
      throw new Error(`maCross: ${code} 不在回测的 ETF 集合内`);
    }
    if (fast >= slow) {
      throw new Error(`maCross: fast(${fast}) 必须小于 slow(${slow})`);
    }

    const closes = ctx.closes(code);
    const fastSeries = sma(closes, fast);
    const slowSeries = sma(closes, slow);

    const fastNow = lastValue(fastSeries);
    const slowNow = lastValue(slowSeries);
    const fastPrev = valueAtOffset(fastSeries, 1);
    const slowPrev = valueAtOffset(slowSeries, 1);

    if (fastNow === null || slowNow === null || fastPrev === null || slowPrev === null) {
      return {};
    }

    const held = ctx.position(code) !== null;

    if (fastPrev <= slowPrev && fastNow > slowNow && !held) {
      state.lastSignal = "golden";
      return {
        orders: [{ code, side: "buy", percent: 1, reason: `金叉 fast=${fast}, slow=${slow}` }],
        logs: [`${ctx.date} 金叉买入 ${code}`],
      };
    }

    if (fastPrev >= slowPrev && fastNow < slowNow && held) {
      state.lastSignal = "death";
      return {
        orders: [{ code, side: "sell", percent: 1, reason: `死叉 fast=${fast}, slow=${slow}` }],
        logs: [`${ctx.date} 死叉卖出 ${code}`],
      };
    }

    return {};
  },
});

export default movingAverageCrossStrategy;
