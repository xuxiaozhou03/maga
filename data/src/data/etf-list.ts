import { Etf, fetchOriginalEtfs } from "../fetch/etfs";
import { fetchLinkFund } from "../fetch/linkFund";
import { classifyEtfs } from "./etf-categories";

export const fetchEtfs = async () => {
  const originalEtfs = await fetchOriginalEtfs();
  const map = originalEtfs.reduce(
    (acc, item) => ({
      ...acc,
      [item.code]: item,
    }),
    {} as Record<string, Etf>,
  );
  const codes = Object.keys(map);
  const linkFunds = await Promise.all(
    codes.map((code) => fetchLinkFund(code, codes)),
  );
  linkFunds
    .flat(1)
    .map((linkFund) => {
      if (map[linkFund.target].scale < map[linkFund.source].scale) {
        const source = linkFund.source;
        linkFund.source = linkFund.target;
        linkFund.target = source;
      }
      return linkFund;
    })
    .sort((a, b) => {
      return map[a.target].scale < map[b.target].scale ? 1 : -1;
    })
    .forEach((linkFund) => {
      delete map[linkFund.source];
    });

  const etfs = Object.values(map);

  const classifies = await classifyEtfs(etfs);
  return classifies;
};
