/**
 * 内置示例策略。
 *
 * 仅用于验证通用策略系统与回测引擎，不作为引擎内部的硬编码分支
 * （对应 PRD 第 7 节）。
 */

import { lastValue, sma, valueAtOffset } from "@/services/backtest/indicators/indicators";
import type { Strategy } from "./engine";

export type BuyAndHoldParams = {
  /** 目标 ETF 代码，缺省取回测配置中的第一个。 */
  code?: string;
};

type BuyAndHoldState = {
  /** 是否已经建过仓（建仓前允许因拒单在后续交易日重试）。 */
  bought: boolean;
};

/** 买入持有：首次可成交日一次性买入并持有到期末。 */
export const buyAndHoldStrategy: Strategy<BuyAndHoldParams, BuyAndHoldState> = {
  name: "买入持有",
  description: "在首个有行情的交易日按可用资金买入，之后一直持有。",
  params: {},
  initialize: () => ({ bought: false }),
  onBar(ctx, state) {
    const code = ctx.params.code ?? ctx.codes[0];
    if (!ctx.codes.includes(code)) {
      throw new Error(`buyAndHold: ${code} 不在回测的 ETF 集合内`);
    }

    if (state.bought) return {};
    if (!ctx.bar(code)) return {};

    if (ctx.position(code)) {
      state.bought = true;
      return {};
    }

    return {
      orders: [{ code, side: "buy", percent: 1, reason: "买入持有：首次建仓" }],
      logs: [`${ctx.date} 建仓 ${code}`],
    };
  },
};

export type MaCrossParams = {
  code?: string;
  fast?: number;
  slow?: number;
};

type MaCrossState = {
  lastSignal: "golden" | "death" | null;
};

/** 均线交叉：短均线上穿长均线买入，下穿卖出。 */
export const movingAverageCrossStrategy: Strategy<MaCrossParams, MaCrossState> = {
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
};

export const BUILTIN_STRATEGIES = {
  buyAndHold: buyAndHoldStrategy,
  movingAverageCross: movingAverageCrossStrategy,
} as const;
