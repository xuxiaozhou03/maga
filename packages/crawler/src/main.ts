import { fetchEtfs } from "./etfs";
import { fetchKline } from "./kline/fetchKline";

console.log("Starting the crawler...");

const main = async () => {
  const etfs = await fetchEtfs();
  for (const etf of etfs) {
    console.log(`Fetching Kline data for ETF: ${etf.code} - ${etf.name}`);
    await fetchKline(etf.code);
  }
  console.log("Crawler finished.");
};

main().catch((error) => {
  console.error("An error occurred:", error);
  process.exit(1);
});
