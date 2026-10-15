import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

interface OriginalEtf {
  securityName: string;
  securityCode: string;
  scale: number | null;
  trackingIndex: string | null;
  trackIndex: string | null;
}

async function fetchEtfs() {
  const response = await fetch(
    "https://hongsehuojian.com/fundex-quote/allPage/findListByEtf?classA=&classB=&orderBy=l.scale&order=desc&searchValue=&isSelected=&pageNo=1&pageSize=2000&position=",
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        pragma: "no-cache",
        pro: "RedRocket-PC",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
      method: "GET",
    },
  );

  const data = (await response.json()) as {
    data: { data: OriginalEtf[] };
  };
  const list = data.data.data
    .map<Prisma.EtfCreateInput>((item) => ({
      code: item.securityCode,
      name: item.securityName,
      scale: item.scale ?? 0,
      trackingIndex: item.trackingIndex ?? "",
      trackIndex: item.trackIndex!,
    }))
    .filter(
      (etf) =>
        [
          "NDX.GI",
          "SPTR500N.SPI",
          "NDXTMC.GI",
          "SPX.GI",
          "DJI.GI",
          "750108.MI",
          "NBI.GI",
          "SPSIBI.SPI",
          "SP5CSSUP.SPI",
        ].includes(etf.trackIndex) || etf.code === "510300.SH",
    )
    .sort((a, b) => a.trackIndex?.localeCompare(b.trackIndex ?? "") ?? 0);

  return list;
}

export const runEtfTask = async () => {
  console.log("Fetching ETF data...");
  const etfs = await fetchEtfs();
  await prisma.$transaction(async (tx) => {
    for (const etf of etfs) {
      await tx.etf.upsert({
        where: {
          code: etf.code,
        },
        create: etf,
        update: etf,
      });
    }
  });
  console.log(`Fetched and stored ${etfs.length} ETFs.`);
  return etfs;
};
