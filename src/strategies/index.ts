import MaCross from "./ma-cross.js";
import MomentumRank from "./momentum-rank.js";
import ValuationTiming from "./valuation-timing.js";
import type { Strategy } from "../engine/types.js";

export interface StrategyMeta {
  key: string;
  name: string;
  description: string;
  paramsSchema: Record<
    string,
    { type: "number" | "string"; default?: unknown; desc?: string }
  >;
  createStrategy: new () => Strategy;
}

export const registry: Record<string, StrategyMeta> = {
  ma_cross: {
    key: "ma_cross",
    name: "双均线",
    description: "金叉买入、死叉清仓（单标的）",
    paramsSchema: {
      fast: { type: "number", default: 5 },
      slow: { type: "number", default: 20 },
    },
    createStrategy: MaCross,
  },
  valuation_timing: {
    key: "valuation_timing",
    name: "估值分位择时",
    description: "PE 分位低买高卖（单标的）",
    paramsSchema: {
      low: { type: "number", default: 0.3 },
      high: { type: "number", default: 0.7 },
    },
    createStrategy: ValuationTiming,
  },
  momentum_rank: {
    key: "momentum_rank",
    name: "动量排名轮动",
    description: "按 rank_ret_1m 取 TopN 等权",
    paramsSchema: { topN: { type: "number", default: 3 } },
    createStrategy: MomentumRank,
  },
};
