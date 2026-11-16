import fs from "fs";
import { fetchKline } from "./klines";
import { fetchIndexValuation } from "./valuation";
import { calculateEtfFeatures } from "./calculateEtfFeatures";
import { classifyEtfs } from "./data/etf-categories";
import { fetchEtfs } from "./data/etf-list";

const main = async () => {
  const etfs = await fetchEtfs();

  fs.writeFileSync("./output/etfs.json", JSON.stringify(etfs));
  const fields = [
    "category",
    "name",
    "code",
    "trackingIndex",
    "premiumRate",
    "scale",
  ];
  fs.writeFileSync(
    "./output/etfs.csv",
    [
      fields.join(","),
      ...etfs.map((item: any) => fields.map((field) => item[field])),
    ].join("\n"),
  );

  return;

  // const classifies = await classifyEtfs(etfs);

  // return;
  // const etf = etfs[0];
  // const klines = await fetchKline(etf.code);

  // fs.writeFileSync(`./output/${etf.code}-klines.json`, JSON.stringify(klines));

  // const pe = await fetchIndexValuation(etf.trackIndex, "PE");
  // fs.writeFileSync(`./output/${etf.trackIndex}-pe.json`, JSON.stringify(pe));

  // const pb = await fetchIndexValuation(etf.trackIndex, "PB");
  // fs.writeFileSync(`./output/${etf.trackIndex}-pb.json`, JSON.stringify(pb));

  // const ps = await fetchIndexValuation(etf.trackIndex, "PS");
  // fs.writeFileSync(`./output/${etf.trackIndex}-ps.json`, JSON.stringify(ps));

  // const etfFeatures = await calculateEtfFeatures(etf, klines, [
  //   ...pe,
  //   ...pb,
  //   ...ps,
  // ]);
  // fs.writeFileSync(
  //   `./output/${etf.code}-features.json`,
  //   JSON.stringify(etfFeatures),
  // );
};

main().finally(() => {
  console.log("done");
});
