import type { Context, Strategy } from "../engine/types.js";

export default class MomentumRank implements Strategy {
  private topN = 3;

  initialize(params: Record<string, unknown>) {
    this.topN = Math.max(1, Number(params.topN ?? 3));
  }

  handleBar(context: Context) {
    const scored = context.codes
      .map((code) => ({
        code,
        rank: context.getFeature(code, "rank_ret_1m"),
      }))
      .filter(
        (item): item is { code: string; rank: number } => item.rank != null,
      )
      .sort((a, b) => b.rank - a.rank);
    if (!scored.length) return;
    const top = scored.slice(0, this.topN);
    const weight = 1 / top.length;
    context.setTargetWeight(
      Object.fromEntries(top.map((item) => [item.code, weight])),
    );
  }
}
