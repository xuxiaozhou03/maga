// packages/crawler/src/crossSection.ts
import { prisma, type Kline } from "../prisma/index.js";
import type { Task } from "../utils/runTask.js";
import {
  ensureAscending,
  calculateCoreMetrics,
  calculateCorrelationMatrix,
  relativeStrength,
  buildCrossSectionTable,
  type CoreMetrics,
} from "./stats/index.js";

/** 横截面任务的取数结果：逐只 ETF 的升序 K 线 + 名称。 */
export interface CrossSectionInput {
  klinesByCode: Record<string, Kline[]>;
  names: Record<string, string>;
}

/**
 * 多 ETF 横截面计算任务。
 *
 * fetch：按 codes 逐只取升序 K 线，并取名称。
 * save：逐只调 calculateCoreMetrics，再做相关系数、相对强弱、排名汇总。
 *
 * 与 getCalcTask 一致：不新增/修改表，结果先走结构化日志。
 */
export const getCrossSectionTask = (
  codes: string[],
): Task<CrossSectionInput> => ({
  name: `cross_section_calc`,
  fetch: async () => {
    const klinesByCode: Record<string, Kline[]> = {};
    const names: Record<string, string> = {};

    for (const code of codes) {
      const [klines, etf] = await Promise.all([
        prisma.kline.findMany({
          where: { code },
          orderBy: { date: "asc" },
        }),
        prisma.etf.findUnique({ where: { code } }),
      ]);
      klinesByCode[code] = ensureAscending(klines);
      if (etf) names[code] = etf.name;
    }

    return { klinesByCode, names };
  },
  async save({ klinesByCode, names }) {
    // 1) 单 ETF 指标：逐只调用，跳过有效 K 线不足的标的
    const metricsByCode: Record<string, CoreMetrics> = {};
    for (const [code, klines] of Object.entries(klinesByCode)) {
      if (klines.length < 2) {
        console.log(`${code} K 线不足，跳过横截面指标`);
        continue;
      }
      metricsByCode[code] = calculateCoreMetrics(klines);
    }

    const validCodes = Object.keys(metricsByCode);
    if (validCodes.length === 0) {
      console.log("无有效 ETF，跳过横截面计算");
      return;
    }

    // 2) 相关系数矩阵（仅对有效标的，按日期 inner join）
    const validKlines: Record<string, Kline[]> = {};
    for (const code of validCodes) validKlines[code] = klinesByCode[code];
    const corr = calculateCorrelationMatrix(validKlines);

    // 3) 相对强弱：以第一个有效标的为基准，与其余标的逐一比较
    const baseCode = validCodes[0];
    const relative: Record<
      string,
      { latestDate: number | null; latestRatio: number | null }
    > = {};
    for (const code of validCodes.slice(1)) {
      const rs = relativeStrength(validKlines[baseCode], validKlines[code]);
      relative[code] = {
        latestDate: rs.dates[rs.dates.length - 1] ?? null,
        latestRatio: rs.ratio[rs.ratio.length - 1] ?? null,
      };
    }

    // 4) 横向对比表 + 排名
    const table = buildCrossSectionTable(metricsByCode, names);

    // 5) 结构化日志（阶段 1、2 完成前不落表）
    console.log(
      JSON.stringify({
        task: "cross_section",
        codes: validCodes,
        baseCode,
        table,
        correlation: corr,
        relative,
      }),
    );
  },
});
