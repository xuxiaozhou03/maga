import { prisma } from "@maga/db";
import { etfsTask } from "./fetchEtfs";
import { runTask } from "./utils";
import { getKlineTask } from "./fetchKlines";

const runCrawler = async () => {
  console.log("Starting the crawler...");

  await runTask(etfsTask);

  const etfs = await prisma.etf.findMany({
    orderBy: { scale: "desc" },
  });
  console.log("Retrieved ETFs:", etfs.length);
  for (const etf of etfs) {
    await runTask(getKlineTask(etf.code));
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Sleep for 1 second between tasks
  }
};

if (require.main === module) {
  runCrawler();
}
