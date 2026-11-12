import { prisma } from "@/packages/db";
import { runTask, runTasks } from "../utils";
import { etfsTask } from "./etfs";
import { getKlineTask } from "./klines";
import { getIndexValuationTasks } from "./valuation";

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
