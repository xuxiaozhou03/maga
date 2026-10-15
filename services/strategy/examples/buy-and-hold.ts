/**
 * 示例策略：买入持有。
 *
 * 在首个有行情的交易日按可用资金建仓，之后一直持有到期末。
 * 运行：pnpm strategy:run services/strategy/examples/buy-and-hold.ts --code 510300.SH
 */

import { defineStrategy } from "@/services/strategy/types";

export type BuyAndHoldParams = {
  /** 目标 ETF 代码，缺省取回测配置中的第一个。 */
  code?: string;
};

type BuyAndHoldState = {
  /** 是否已建仓；建仓前允许因拒单在后续交易日重试。 */
  bought: boolean;
};

export const buyAndHoldStrategy = defineStrategy<BuyAndHoldParams, BuyAndHoldState>({
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
});

export default buyAndHoldStrategy;
