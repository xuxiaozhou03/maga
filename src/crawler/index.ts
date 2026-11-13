import { prisma } from "../prisma/index.js";
import { runTask, runTasks } from "../utils/runTask.js";
import { getKlineTask } from "./etf/klines.js";
import { etfsTask } from "./etfs.js";
import { getIndexDistributionTask } from "./index/distribution.js";
import { getIndexValuationTasks } from "./index/valuation.js";

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
