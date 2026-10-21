import { prisma } from "@maga/db";
import { etfTask } from "./etfs";
import { runTask } from "./utils";
import { getKlineTask } from "./kline";
import { getCalcTask } from "./calc";

export const runCrawler = async () => {
  console.log("Starting the crawler...");

  await runTask(etfTask);

  const etfs = await prisma.etf.findMany({
    take: 1,
    orderBy: {
      scale: "desc",
    },
  });
  for (const etf of etfs) {
    await runTask(getKlineTask(etf.code));
    await runTask(getCalcTask(etf.code));
  }
  console.log("Crawler finished.");
};
