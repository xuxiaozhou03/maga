import { prisma, Prisma } from "@maga/db";
import { Task } from "./utils";

interface OriginalEtf {
  securityName: string;
  securityCode: string;
  scale: number | null;
  trackingIndex: string | null;
  trackIndex: string | null;
  premiumRate: string | number | null;
}

const whiteList = ["转债"];
const blackList = ["短融", "债"];

async function fetchEtfs() {
  const ret = await fetch(
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
  const res = (await ret.json()) as {
    data: { data: OriginalEtf[] };
  };

  const map: Record<string, Prisma.EtfCreateInput> = {};

  res.data.data
    .filter((etf) => etf.scale && etf.scale > 300000000)
    .filter(({ trackIndex, trackingIndex }) => {
      if (!trackIndex || !trackingIndex) {
        return false;
      }

      if (whiteList.find((key) => trackingIndex.includes(key))) {
        return true;
      }

      if (blackList.find((key) => trackingIndex.includes(key))) {
        return false;
      }

      return true;
    })
    .forEach((originEtf) => {
      const etf = {
        code: originEtf.securityCode,
        name: originEtf.securityName,
        scale: originEtf.scale ?? 0,
        trackingIndex: originEtf.trackingIndex ?? "",
        trackIndex: originEtf.trackIndex!,
        premiumRate: originEtf.premiumRate
          ? parseFloat(originEtf.premiumRate + "")
          : null,
      };
      if (!map[etf.trackIndex] || map[etf.trackIndex].scale < etf.scale) {
        map[etf.trackIndex] = etf;
      }
    });

  return Object.values(map).sort((a, b) => (a.scale > b.scale ? -1 : 1));
}

export const etfTask: Task<Prisma.EtfCreateInput[]> = {
  name: "etfs",
  fetch: fetchEtfs,
  save: async (etfs) => {
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
      await tx.etf.deleteMany({
        where: {
          code: {
            notIn: etfs.map((etf) => etf.code),
          },
        },
      });
    });
  },
};
