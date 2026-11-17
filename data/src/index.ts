import { fetchEtfs } from "./fetch/etfs";
import { fetchLinkFund } from "./fetch/linkFund";
import { groupEtfCategory } from "./utils/categories";
import { Etf, EtfNotCategory } from "./type";
import { runStep } from "./utils/runStep";
import { fetchKline } from "./fetch/klines";
import { fetchIndexValuation } from "./fetch/valuation";
import { calculateEtfFeatures } from "./utils/calculateEtfFeatures";

const findNotRepeatEtfs = async (etfs: EtfNotCategory[]) => {
  const etfsMap = etfs.reduce(
    (acc, item) => ({
      ...acc,
      [item.code]: item,
    }),
    {} as Record<string, EtfNotCategory>,
  );
  const codes = Object.keys(etfsMap);
  const linkFunds = await Promise.all(
    codes.map((code) => fetchLinkFund(code, codes)),
  );
  const repeatCodes = linkFunds.flat(1).map((linkFund) => {
    if (etfsMap[linkFund.target].scale < etfsMap[linkFund.source].scale) {
      return linkFund.target;
    }
    return linkFund.source;
  });

  return [...new Set(repeatCodes)];
};

const main = async () => {
  const etfNotCategories = await runStep<EtfNotCategory[]>(
    "01-etfs.json",
    fetchEtfs,
  );
  const repeatCodes = await runStep<string[]>("02-repeatCodes.json", async () =>
    findNotRepeatEtfs(etfNotCategories),
  );

  const notRepeatEtfs = await runStep<EtfNotCategory[]>(
    "03-notrepeat-etfs.json",
    async () =>
      etfNotCategories.filter((etf) => !repeatCodes.includes(etf.code)),
  );
  const etfs = await runStep<Etf[]>("etfs.json", async () =>
    groupEtfCategory(notRepeatEtfs),
  );
  const etf = etfs.find((etf) => etf.code === "510300.SH");
  if (etf) {
    await runStep(`${etf.code}.json`, async () => {
      const klines = await fetchKline(etf.code);
      const pe = await fetchIndexValuation(etf.trackIndex, "PE");
      const pb = await fetchIndexValuation(etf.trackIndex, "PB");
      const ps = await fetchIndexValuation(etf.trackIndex, "PS");
      const etfFeatures = calculateEtfFeatures(klines, [...pe, ...pb, ...ps]);
      return etfFeatures;
    });
  }
};

main().finally(() => {
  console.log("done");
});
