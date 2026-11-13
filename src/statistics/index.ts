import { prisma } from "../prisma/index.js";
import { runTasks } from "../utils/runTask.js";
import { getCalcTask } from "./etf.js";

export const run = async (force: boolean = false) => {
  console.log("Starting the crawler...");

  if (force) {
    await prisma.task.deleteMany();
  }

  const etfs = await prisma.etf.findMany({
    orderBy: { scale: "desc" },
    take: 1,
  });

  const calcTasks = etfs.map((etf) => getCalcTask(etf.code));
  await runTasks(calcTasks);

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
