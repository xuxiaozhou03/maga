import { SMA } from "trading-signals";
import type { Context, Strategy } from "../../engine/types.js";

export default class MaCross implements Strategy {
  static key = "ma_cross";
  static name = "双均线";
  static description = "金叉买入、死叉清仓（单标的）";
  static paramsSchema = {
    fast: { type: "number", default: 5 },
    slow: { type: "number", default: 20 },
  };

  private fast = 5;
  private slow = 20;

  initialize(params: Record<string, unknown>) {
    this.fast = Number(params.fast ?? 5);
    this.slow = Number(params.slow ?? 20);
  }

  handleBar(context: Context) {
    const code = context.codes[0];
    const bars = context.getBars(code, this.slow + 1);
    if (bars.length < this.slow + 1) return;

    const average = (closes: number[], interval: number) => {
      const indicator = new SMA(interval);
      for (const close of closes) indicator.add(close);
      return indicator.getResultOrThrow();
    };
    const closes = bars.map((bar) => bar.close);
    const previousCloses = closes.slice(0, -1);
    const fastNow = average(closes, this.fast);
    const slowNow = average(closes, this.slow);
    const fastPrevious = average(previousCloses, this.fast);
    const slowPrevious = average(previousCloses, this.slow);

    if (fastPrevious <= slowPrevious && fastNow > slowNow) {
      context.setTargetWeight({ [code]: 1 });
    } else if (fastPrevious >= slowPrevious && fastNow < slowNow) {
      context.setTargetWeight({ [code]: 0 });
    }
  }
}
