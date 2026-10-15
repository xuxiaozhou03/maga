import { runEtfTask } from "./etfs";
import { runKlineTask } from "./kline";
import { prisma } from "../prisma";

export const runCrawler = async () => {
  console.log("Starting the crawler...");

  const etfs = await runEtfTask();

  for (const etf of etfs) {
    console.log(`Fetching Kline data for ETF: ${etf.code} - ${etf.name}`);
    await runKlineTask(etf.code);
  }
  console.log("Crawler finished.");
};

/** 只刷新 ETF 基础信息（含溢价率），不拉取 K 线。 */
export const runEtfOnly = async () => runEtfTask();

/** 按数据库中已有的 ETF 刷新 K 线。 */
export const runKlineOnly = async (): Promise<number> => {
  const etfs = await prisma.etf.findMany({
    select: { code: true },
    orderBy: { code: "asc" },
  });

  for (const etf of etfs) {
    console.log(`Fetching Kline data for ETF: ${etf.code}`);
    await runKlineTask(etf.code);
  }

  return etfs.length;
};
