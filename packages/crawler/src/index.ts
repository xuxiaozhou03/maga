import { prisma } from "@maga/db";
import { runTask, runTasks } from "./utils";
import { etfsTask } from "./tasks/etfs";
import { getKlineTask } from "./tasks/klines";
import { getEtfStatisticsTask } from "./tasks/etf-statistics";
import { etfsStatisticsTask } from "./tasks/etfs-statistics";

const runCrawler = async (force: boolean = false) => {
  console.log("Starting the crawler...");

  if (force) {
    await prisma.task.deleteMany();
  }

  await runTask(etfsTask);

  const etfs = await prisma.etf.findMany({
    orderBy: { scale: "desc" },
    take: 0,
  });

  const klinesTasks = etfs.map((etf) => getKlineTask(etf.code));
  await runTasks(klinesTasks);

  const etfStatisticsTasks = etfs.map((etf) => getEtfStatisticsTask(etf.code));
  await runTasks(etfStatisticsTasks);

  await runTask(etfsStatisticsTask);

  await prisma.$disconnect();

  console.log("Crawler finished.");
};

if (require.main === module) {
  process.argv.includes("--force") ? runCrawler(true) : runCrawler();
}
