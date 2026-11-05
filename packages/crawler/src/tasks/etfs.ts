import { Etf, prisma } from "@maga/db";
import { Task } from "../utils";

interface OriginalEtf {
  securityName: string;
  securityCode: string;
  scale: number | null;
  trackingIndex: string | null;
  trackIndex: string | null;
  premiumRate: string | number | null;
}

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

  const map: Record<string, Etf> = {};

  res.data.data.forEach(
    ({
      securityCode,
      securityName,
      scale,
      trackingIndex,
      trackIndex,
      premiumRate,
    }) => {
      if (
        !securityCode ||
        !securityName ||
        !trackIndex ||
        ["短融", "债"].find((item) => securityName.includes(item)) ||
        // 规模小于 3 亿过滤掉
        scale! < 300000000 ||
        (map[trackIndex] && map[trackIndex].scale > scale!)
      ) {
        return;
      }
      map[trackIndex] = {
        code: securityCode,
        name: securityName,
        scale: scale ?? 0,
        trackingIndex: trackingIndex ?? "",
        trackIndex: trackIndex!,
        premiumRate: premiumRate ? parseFloat(premiumRate + "") : null,
      };
    },
  );
  return Object.values(map).sort((a, b) => b.scale - a.scale);
}

export const etfsTask: Task<Etf[]> = {
  name: "etfs",
  fetch: fetchEtfs,
  save: async (data) => {
    await prisma.$transaction(async (tx) => {
      for (const etf of data) {
        await tx.etf.upsert({
          where: { code: etf.code },
          create: etf,
          update: etf,
        });
      }
      await tx.etf.deleteMany({
        where: {
          code: {
            notIn: data.map((etf) => etf.code),
          },
        },
      });
      await tx.kline.deleteMany({
        where: {
          code: {
            notIn: data.map((etf) => etf.code),
          },
        },
      });
    });
  },
};
