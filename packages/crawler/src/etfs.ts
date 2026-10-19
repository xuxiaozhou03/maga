import { prisma, Prisma } from "@maga/db";

interface OriginalEtf {
  securityName: string;
  securityCode: string;
  scale: number | null;
  trackingIndex: string | null;
  trackIndex: string | null;
  /** 上游按字符串返回溢价率（百分数），例如 "0.02"、"-0.10"；也可能为 null。 */
  premiumRate: string | number | null;
}

/**
 * 解析上游溢价率。
 *
 * 单位为百分数（0.02 表示 0.02%），与 `changePercent` 口径一致；
 * 上游为空或无法解析时返回 null。
 */
export function parsePremiumRate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
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
      premiumRate: parsePremiumRate(item.premiumRate),
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
        ].includes(etf.trackIndex),
      // || etf.code === "510300.SH",
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
