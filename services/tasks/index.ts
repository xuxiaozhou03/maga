import { runTask, runTasks } from "./utils";
import { etfsTask } from "./crawler/etfs";
import { getKlineTask } from "./crawler/klines";
import { getIndexValuationTasks } from "./crawler/valuation";
import { prisma } from "../db";

export const run = async (force: boolean = false) => {
  console.log("Starting the crawler...");

  if (force) {
    await prisma.task.deleteMany();
  }

  await runTask(etfsTask);

  const etfs = await prisma.etf.findMany({
    orderBy: { scale: "desc" },
    take: 1,
  });

  const klinesTasks = etfs.flatMap((etf) => [
    getKlineTask(etf.code),
    ...getIndexValuationTasks(etf.trackIndex),
  ]);
  await runTasks(klinesTasks);

  console.log("Crawler finished.");
};
