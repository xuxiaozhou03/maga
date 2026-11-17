import { fetchEtfs } from "./fetch/etfs";
import { fetchLinkFund } from "./fetch/linkFund";
import { groupEtfCategory } from "./utils/categories";
import { Etf, EtfNotCategory } from "./type";
import { runStep } from "./utils/runStep";
import { fetchKline } from "./fetch/klines";
import { fetchIndexValuation } from "./fetch/valuation";
import { calculateEtfFeatures, EtfFeatures } from "./calculate/etfFeature";
import { analyzeEtfs, EtfFeatureMap } from "./calculate/analyzeEtfs";

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
  const etfs = await runStep<Etf[]>(
    "etfs.csv",
    async () => groupEtfCategory(notRepeatEtfs),
    [
      "category",
      "code",
      "name",
      "scale",
      "trackingIndex",
      "trackIndex",
      "premiumRate",
    ],
  );
  return;

  const ps = etfs.slice(0, 5).map(async (etf) =>
    runStep<{ code: string; features: EtfFeatures }>(
      `${etf.code}.json`,
      async () => {
        const klines = await fetchKline(etf.code);
        const etfFeatures = calculateEtfFeatures(klines, {
          PE: await fetchIndexValuation(etf.trackIndex, "PE"),
          PB: await fetchIndexValuation(etf.trackIndex, "PB"),
          PS: await fetchIndexValuation(etf.trackIndex, "PS"),
        });
        return {
          code: etf.code,
          features: etfFeatures,
        };
      },
    ),
  );
  const result = await Promise.all(ps);
  await runStep("all.json", async () => {
    return analyzeEtfs(
      result.reduce(
        (acc, item) => ({
          ...acc,
          [item.code]: item.features,
        }),
        {} as EtfFeatureMap,
      ),
    );
  });
};

main().finally(() => {
  console.log("done");
});
