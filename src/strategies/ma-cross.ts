import type { Context, Strategy } from "../engine/types.js";
import { SMA } from "./indicators.js";

export default class MaCross implements Strategy {
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
