import type { Fill } from "./types.js";

export function computeMetrics(
  dailies: { date: number; equity: number }[],
  fills: Fill[],
  initialCash: number,
) {
  if (!dailies.length) {
    return {
      totalReturn: 0,
      annualReturn: 0,
      maxDrawdown: 0,
      sharpe: 0,
      winRate: 0,
      tradeCount: fills.length,
    };
  }

  const count = dailies.length;
  const totalReturn = dailies[count - 1].equity / initialCash - 1;
  const annualReturn =
    Math.pow(Math.max(0.000001, 1 + totalReturn), 252 / count) - 1;

  let peak = dailies[0].equity;
  let maxDrawdown = 0;
  for (const daily of dailies) {
    peak = Math.max(peak, daily.equity);
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, daily.equity / peak - 1);
    }
  }

  const returns: number[] = [];
  for (let i = 1; i < count; i++) {
    const previous = dailies[i - 1].equity;
    if (previous > 0) returns.push(dailies[i].equity / previous - 1);
  }
  const average =
    returns.reduce((total, value) => total + value, 0) / (returns.length || 1);
  const variance =
    returns.reduce((total, value) => total + (value - average) ** 2, 0) /
    (returns.length || 1);
  const standardDeviation = Math.sqrt(variance);
  const sharpe =
    standardDeviation === 0
      ? 0
      : (average / standardDeviation) * Math.sqrt(252);

  const averageCost: Record<string, { shares: number; cost: number }> = {};
  let wins = 0;
  let closed = 0;
  for (const fill of fills) {
    if (fill.side === "buy") {
      const position = averageCost[fill.code] ?? { shares: 0, cost: 0 };
      position.shares += fill.shares;
      position.cost += fill.shares * fill.price + fill.fee;
      averageCost[fill.code] = position;
      continue;
    }

    const position = averageCost[fill.code];
    if (!position || position.shares <= 0) continue;
    const sellPrice = fill.price - fill.fee / fill.shares;
    const buyAverage = position.cost / position.shares;
    closed++;
    if (sellPrice > buyAverage) wins++;
    position.shares -= fill.shares;
    position.cost -= buyAverage * fill.shares;
  }

  return {
    totalReturn,
    annualReturn,
    maxDrawdown,
    sharpe,
    winRate: closed ? wins / closed : 0,
    tradeCount: fills.length,
  };
}
