import { runEtfTask } from "./etfs";
import { runKlineTask } from "./kline";

export const runCrawler = async () => {
  console.log("Starting the crawler...");

  const etfs = await runEtfTask();

  for (const etf of etfs) {
    console.log(`Fetching Kline data for ETF: ${etf.code} - ${etf.name}`);
    await runKlineTask(etf.code);
  }
  console.log("Crawler finished.");
};
