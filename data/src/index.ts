import { analyzeEtf } from "./calculate/etfAnalysis";
import { fetchEtfs } from "./fetch/etfs";
import { fetchKline } from "./fetch/klines";
import { fetchIndexValuation } from "./fetch/valuation";
import { groupEtfCategory } from "./utils/categories";
import { filterRepeatEtfs } from "./utils/filterRepeatEtfs";
import source from "./utils/source";

const main = async () => {
  const etfsWithoutCategory = await fetchEtfs();
  const etfsWithoutRepeat = await filterRepeatEtfs(etfsWithoutCategory);
  const etfs = groupEtfCategory(etfsWithoutRepeat);
  source.saveJson("etfs.json", etfs);
  for (const etf of etfs.slice(0, 2)) {
    const klines = await fetchKline(etf.code);
    const analyze = analyzeEtf({
      klines,
      valuations: {
        PE: await fetchIndexValuation(etf.trackIndex, "PE"),
        PB: await fetchIndexValuation(etf.trackIndex, "PB"),
        PS: await fetchIndexValuation(etf.trackIndex, "PS"),
      },
    });
    source.saveJson(`${etf.code}.json`, analyze);
  }
};

main().finally(() => {
  console.log("done");
});
