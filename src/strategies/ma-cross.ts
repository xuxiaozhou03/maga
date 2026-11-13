import type { Context, Strategy } from "../engine/types.js";

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
    const average = (items: typeof bars, length: number) =>
      items.slice(-length).reduce((total, bar) => total + bar.close, 0) / length;
    const fastNow = average(bars, this.fast);
    const slowNow = average(bars, this.slow);
    const previous = bars.slice(0, -1);
    const fastPrevious = average(previous, this.fast);
    const slowPrevious = average(previous, this.slow);
    if (fastPrevious <= slowPrevious && fastNow > slowNow) {
      context.setTargetWeight({ [code]: 1 });
    } else if (fastPrevious >= slowPrevious && fastNow < slowNow) {
      context.setTargetWeight({ [code]: 0 });
    }
  }
}
