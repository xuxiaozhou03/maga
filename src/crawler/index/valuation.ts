import { prisma, type Valuation } from "../../prisma/index.js";
import type { Task } from "../../utils/runTask.js";

const valuationTypes = ["PE", "PB", "PS", "DID"] as const;

type ValuationType = (typeof valuationTypes)[number];

async function fetchIndexValuation(
  securityCode: string,
  valuationType: ValuationType,
): Promise<Valuation[]> {
  const ret = await fetch(
    `https://hongsehuojian.com/fundex-quote/index/valuation?securityCode=${securityCode}&valuationType=${valuationType}&timeInterval=last_5_years&ts=${Date.now()}`,
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        pla: "rr_Android",
        pragma: "no-cache",
        pro: "RedRocket",
        "sec-ch-ua":
          '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        ver: "",
        Referer: `https://hongsehuojian.com/index/h5/fundexh5bai/index.html?targetPage=indexDetail&securityCode=${securityCode}&pro=RedRocket-PC`,
      },
      body: null,
      method: "GET",
    },
  );
  const res = (await ret.json()) as {
    code: "200";
    data: {
      items: Array<{
        tradeDate: string;
        valuationValue: number;
        historicalPercentile: number;
        peg: number | null;
      }>;
    };
  };

  if (res.code !== "200") {
    return [];
  }

  return res.data.items.map((item) => ({
    code: securityCode,
    type: valuationType,
    date: Number(item.tradeDate),
    value: item.valuationValue,
    percent:
      item.historicalPercentile > 1
        ? item.historicalPercentile / 100
        : item.historicalPercentile,
    peg: item.peg,
  }));
}

const getIndexValuationTask = (
  securityCode: string,
  valuationType: ValuationType,
): Task<Valuation[]> => ({
  name: `index-valuation-${securityCode}-${valuationType}`,
  fetch: async () => fetchIndexValuation(securityCode, valuationType),
  save: async (data) => {
    await prisma.$transaction(
      data.map((item) =>
        prisma.valuation.upsert({
          where: {
            code_type_date: {
              code: item.code,
              type: item.type,
              date: item.date,
            },
          },
          create: item,
          update: item,
        }),
      ),
    );
  },
});

export const getIndexValuationTasks = (securityCode: string) =>
  valuationTypes.map((valuationType) =>
    getIndexValuationTask(securityCode, valuationType),
  );
