import { prisma } from "@maga/db";
import { runCrawler } from "./runCrawler";

async function main(): Promise<void> {
  await runCrawler();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
