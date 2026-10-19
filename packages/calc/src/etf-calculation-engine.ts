import { prisma } from "@maga/db";
import { calculateSingleEtf } from "./calculateSingleEtf";
import fs from "fs";

export const signleEtfCalculationEngine = async (code: string) => {
  const klines = await prisma.kline.findMany({
    where: { code },
    orderBy: { date: "asc" },
  });
  const result = calculateSingleEtf("510300", klines);

  fs.writeFileSync(`./data/${code}.json`, JSON.stringify(result));
};

export const etfCalculationEngine = async () => {
  const etfs = await prisma.etf.findMany({});
  for (const etf of etfs) {
    await signleEtfCalculationEngine(etf.code);
  }
};
//   // 每只 ETF 单独处理
//   const result1 = calculateSingleEtf("510300", klines510300);
//   const result2 = calculateSingleEtf("510500", klines510500);
//   console.log("510300 是否成功:", result1.success);
//   console.log("510300 历史统计条数:", result1.statistics.length);
//   console.log("510300 每日特征条数:", result1.dailyFeatures.length);
//   console.log("510300 未来标签条数:", result1.forwardLabels.length);
//   console.log("510500 是否成功:", result2.success);
//   console.log("510500 历史统计条数:", result2.statistics.length);
//   console.log("510500 每日特征条数:", result2.dailyFeatures.length);
//   console.log("510500 未来标签条数:", result2.forwardLabels.length);
