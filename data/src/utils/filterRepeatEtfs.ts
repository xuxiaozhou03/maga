import { fetchLinkFund } from "../fetch/linkFund";
import { EtfWithoutCategory } from "../type";

export const filterRepeatEtfs = async (
  etfs: EtfWithoutCategory[],
): Promise<EtfWithoutCategory[]> => {
  const etfsMap = etfs.reduce(
    (acc, item) => ({
      ...acc,
      [item.code]: item,
    }),
    {} as Record<string, EtfWithoutCategory>,
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

  return etfs.filter((etf) => !repeatCodes.includes(etf.code));
};
