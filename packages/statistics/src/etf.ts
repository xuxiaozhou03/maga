import fs from "fs";
import { Kline, prisma, Task } from "@maga/db";
import {
  ensureAscending,
  calculateCoreMetrics,
  calculateRollingMetrics,
  calculateTechnicalIndicators,
  calculateSupplementary,
} from "./stats";

export const getCalcTask = (code: string): Task<Kline[]> => ({
  name: `${code}_calc`,
  fetch: async () => {
    // 改为升序，避免下游各函数自行排序
    const klines = await prisma.kline.findMany({
      where: { code },
      orderBy: { date: "asc" },
    });
    return klines;
  },
  async save(klines) {
    const data = ensureAscending(klines);
    if (data.length < 2) {
      console.log(`${code} K 线不足，跳过计算`);
      return;
    }

    const core = calculateCoreMetrics(data);
    const rolling20 = calculateRollingMetrics(data, 20);
    const tech = calculateTechnicalIndicators(data, [
      "sma",
      "macd",
      "rsi",
      "boll",
      "atr",
    ]);
    const sup = calculateSupplementary(data);

    // 阶段 1、2 完成前不新增统计结果表，先结构化日志输出
    fs.writeFileSync(
      `./logs/${code}_calc.json`,
      JSON.stringify({ core, rolling20, tech, sup }, null, 2),
    );
  },
});
