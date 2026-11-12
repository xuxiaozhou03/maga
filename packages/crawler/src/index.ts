import { prisma, runTask, runTasks } from "@maga/db";
import { etfsTask } from "./etfs";
import { getKlineTask } from "./etf/klines";
import { getIndexValuationTasks } from "./index/valuation";
import { getIndexDistributionTask } from "./index/distribution";

export const run = async (force: boolean = false) => {
  console.log("Starting the crawler...");

  if (force) {
    await prisma.task.deleteMany();
  }

  // await runTask(etfsTask);

  const etfs = await prisma.etf.findMany({
    orderBy: { scale: "desc" },
    take: 1,
  });

  const klinesTasks = etfs.flatMap((etf) => [
    // getKlineTask(etf.code),
    // ...getIndexValuationTasks(etf.trackIndex),
    getIndexDistributionTask(etf.trackIndex),
  ]);
  await runTasks(klinesTasks);

  console.log("Crawler finished.");
};

if (require.main === module) {
  const force = process.argv.includes("--force");
  run(force)
    .then(() => {
      console.log("All tasks completed successfully.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error running tasks:", error);
      process.exit(1);
    });
}
