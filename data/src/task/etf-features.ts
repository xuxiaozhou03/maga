import { etfsData } from "../data";
import { fetchKline } from "../fetch/klines";
import { fetchIndexValuation } from "../fetch/valuation";
import { Etf } from "../type";
import { calculateEtfFeatures } from "../utils/calculateEtfFeatures";
import { saveToFile } from "../utils/file";

const runEtfFeatures = async (etf: Etf) => {
  const klines = await fetchKline(etf.code);
  const pe = await fetchIndexValuation(etf.trackIndex, "PE");
  const pb = await fetchIndexValuation(etf.trackIndex, "PB");
  const ps = await fetchIndexValuation(etf.trackIndex, "PS");
  const etfFeatures = calculateEtfFeatures(etf, klines, [...pe, ...pb, ...ps]);
  saveToFile(`${etf.code}-features.json`, JSON.stringify(etfFeatures));
};

export const runEtfFeaturesTask = async () => {
  const etfs = etfsData.get();
  const etf = etfs[0];
  runEtfFeatures(etf);
};
