import type { Kline } from "../../prisma/index.js";
import type { CoreMetrics } from "./coreMetrics.js";
import { mean } from "./utils.js";

/** 相关系数矩阵结果。matrix[i][j] 是 codes[i] 与 codes[j] 的 Pearson 相关系数。 */
export interface CorrelationResult {
  codes: string[];
  /** 对角线为 1；样本不足或任一方无波动时为 null */
  matrix: Array<Array<number | null>>;
}

/**
 * 计算多只 ETF 日收益的 Pearson 相关系数矩阵（L1，仅依赖 close）。
 *
 * 入参 series：{ code: Kline[] }，每个序列内部需升序。
 * 对齐：按 date 做 inner join，只保留所有 ETF 共同的交易日。
 * 公式：ρ = Σ(rA - avgA)(rB - avgB) / sqrt(Σ(rA-avgA)² · Σ(rB-avgB)²)。
 *
 * 边界：共同交易日不足以产生 2 个收益样本时对应位置 null；
 *       任一方收益无波动时 null，不输出 NaN；
 *       对角线恒为 1。
 */
export function calculateCorrelationMatrix(
  series: Record<string, readonly Kline[]>,
): CorrelationResult {
  const codes = Object.keys(series);
  const byDate: Record<string, Map<number, number>> = {};
  for (const c of codes) {
    byDate[c] = new Map(series[c].map((k) => [k.date, k.close]));
  }
  const commonDates =
    codes.length > 0
      ? [...byDate[codes[0]].keys()]
          .filter((d) => codes.every((c) => byDate[c].has(d)))
          .sort((a, b) => a - b)
      : [];

  const returnsByCode: Record<string, number[]> = {};
  for (const c of codes) {
    const closes = commonDates.map((d) => byDate[c].get(d)!);
    returnsByCode[c] = [];
    for (let i = 1; i < closes.length; i++) {
      returnsByCode[c].push(
        closes[i - 1] > 0 ? closes[i] / closes[i - 1] - 1 : 0,
      );
    }
  }

  const matrix: Array<Array<number | null>> = codes.map(() =>
    codes.map(() => null),
  );
  for (let i = 0; i < codes.length; i++) {
    for (let j = 0; j < codes.length; j++) {
      if (i === j) {
        matrix[i][j] = 1;
        continue;
      }
      const a = returnsByCode[codes[i]];
      const b = returnsByCode[codes[j]];
      if (a.length !== b.length || a.length < 2) continue;
      const ma = mean(a)!;
      const mb = mean(b)!;
      let cov = 0;
      let va = 0;
      let vb = 0;
      for (let k = 0; k < a.length; k++) {
        cov += (a[k] - ma) * (b[k] - mb);
        va += (a[k] - ma) ** 2;
        vb += (b[k] - mb) ** 2;
      }
      if (va === 0 || vb === 0) continue;
      matrix[i][j] = cov / Math.sqrt(va * vb);
    }
  }
  return { codes, matrix };
}

/** 相对强弱结果。dates/ratio 逐位对齐，只保留两序列共同交易日。 */
export interface RelativeStrengthResult {
  dates: number[];
  /** A 收盘 / B 收盘 */
  ratio: number[];
}

/**
 * 计算 A 相对 B 的强弱比值（L1，仅依赖 close）。
 *
 * 对齐：按 date inner join，只保留共同交易日；close <= 0 的日期跳过。
 * 返回 ratio[i] = A.close / B.close，对应 dates[i]。
 *
 * 注意：前复权下该比值只在 A、B 之间相对有意义，不等于真实价格比。
 */
export function relativeStrength(
  a: readonly Kline[],
  b: readonly Kline[],
): RelativeStrengthResult {
  const mapB = new Map(b.map((k) => [k.date, k.close]));
  const dates: number[] = [];
  const ratio: number[] = [];
  for (const ka of a) {
    const cb = mapB.get(ka.date);
    if (cb !== undefined && ka.close > 0 && cb > 0) {
      dates.push(ka.date);
      ratio.push(ka.close / cb);
    }
  }
  return { dates, ratio };
}

/** 排名指标类型。 */
export type RankMetric =
  | "totalReturn"
  | "volatility"
  | "maxDrawdown"
  | "sharpe";

/** 单只 ETF 的排名行。rank 从 1 开始，指标为 null 的不参与排名。 */
export interface RankRow {
  code: string;
  value: number | null;
  rank: number | null;
}

/**
 * 对多只 ETF 的核心指标排名。
 *
 * 排序规则（已在实现中显式区分方向）：
 * - totalReturn / sharpe：数值越高越优，降序。
 * - volatility：年化波动越低越优，升序。
 * - maxDrawdown：值为负数，"绝对值越小越优"等价于数值越大越优，按 |value| 升序。
 *
 * 指标为 null 的 ETF 保留在结果中但 rank = null，不参与名次。
 * 入参 metrics 通常来自 calculateCoreMetrics 的结果。
 */
export function rankEtfs(
  metrics: Record<string, CoreMetrics>,
  metric: RankMetric,
): RankRow[] {
  const rows: RankRow[] = Object.entries(metrics).map(([code, m]) => {
    let value: number | null = null;
    switch (metric) {
      case "totalReturn":
        value = m.totalReturn;
        break;
      case "volatility":
        value = m.volatilityAnnualized;
        break;
      case "maxDrawdown":
        value = m.maxDrawdown;
        break;
      case "sharpe":
        value = m.sharpeRatio;
        break;
    }
    return { code, value, rank: null };
  });

  const valid = rows.filter((r) => r.value !== null);
  valid.sort((x, y) => {
    const vx = x.value as number;
    const vy = y.value as number;
    if (metric === "volatility") return vx - vy;
    if (metric === "maxDrawdown") return Math.abs(vx) - Math.abs(vy);
    return vy - vx;
  });
  valid.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

// packages/crawler/src/stats/crossSection.ts（追加）

/** 横向对比表的一行：单只 ETF 的横截面摘要。 */
export interface CrossSectionRow {
  code: string;
  name: string | null;
  tradingDays: number;
  totalReturn: number | null;
  annualizedReturnCompound: number | null;
  volatilityAnnualized: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;
  calmarRatio: number | null;
  /** 排名（1 最优），由 rankEtfs 结果回填；指标为 null 时为 null */
  rankBySharpe: number | null;
  rankByTotalReturn: number | null;
  rankByVolatility: number | null;
  rankByMaxDrawdown: number | null;
}

/**
 * 把多只 ETF 的核心指标汇总成横向对比表，并回填四种排名。
 *
 * 入参 metricsByCode 由外层逐只调用 calculateCoreMetrics 得到；
 * names 可选，用于展示名称（来自 Etf 表）。
 *
 * 排序方向由 rankEtfs 决定：收益/夏普越高越优，波动/回撤越低越优。
 * 指标为 null 的 ETF 保留在表中，对应排名为 null。
 */
export function buildCrossSectionTable(
  metricsByCode: Record<string, CoreMetrics>,
  names?: Record<string, string>,
): CrossSectionRow[] {
  const bySharpe = rankEtfs(metricsByCode, "sharpe");
  const byReturn = rankEtfs(metricsByCode, "totalReturn");
  const byVol = rankEtfs(metricsByCode, "volatility");
  const byMdd = rankEtfs(metricsByCode, "maxDrawdown");

  const rankMap = (rows: RankRow[]) =>
    Object.fromEntries(rows.map((r) => [r.code, r.rank]));

  const sharpeRank = rankMap(bySharpe);
  const returnRank = rankMap(byReturn);
  const volRank = rankMap(byVol);
  const mddRank = rankMap(byMdd);

  return Object.entries(metricsByCode).map(([code, m]) => ({
    code,
    name: names?.[code] ?? null,
    tradingDays: m.period.tradingDays,
    totalReturn: m.totalReturn,
    annualizedReturnCompound: m.annualizedReturnCompound,
    volatilityAnnualized: m.volatilityAnnualized,
    maxDrawdown: m.maxDrawdown,
    sharpeRatio: m.sharpeRatio,
    calmarRatio: m.calmarRatio,
    rankBySharpe: sharpeRank[code] ?? null,
    rankByTotalReturn: returnRank[code] ?? null,
    rankByVolatility: volRank[code] ?? null,
    rankByMaxDrawdown: mddRank[code] ?? null,
  }));
}
