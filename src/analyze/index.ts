import fs from "fs";
import { analyzeEtf } from "./analyzeEtf";

const main = async () => {
  const etfs = await analyzeEtf({
    code: "510300.SH",
    name: "沪深300ETF华泰柏瑞",
    scale: 224183127994.1,
    trackIndex: "000300.SH",
    trackingIndex: "沪深300",
    premiumRate: -0.04,
    category: "大盘",
  });
  fs.writeFileSync("etfs.json", JSON.stringify(etfs));
};
main().finally(() => {
  console.log("done");
});
