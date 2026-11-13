import type { Context, Strategy } from "../engine/types.js";

export default class ValuationTiming implements Strategy {
  private low = 0.3;
  private high = 0.7;

  initialize(params: Record<string, unknown>) {
    this.low = Number(params.low ?? 0.3);
    this.high = Number(params.high ?? 0.7);
  }

  handleBar(context: Context) {
    const code = context.codes[0];
    const valuation = context.getValuation(code, "PE", context.date);
    if (!valuation) return;
    if (valuation.percent <= this.low) {
      context.setTargetWeight({ [code]: 1 });
    } else if (valuation.percent >= this.high) {
      context.setTargetWeight({ [code]: 0 });
    }
  }
}
