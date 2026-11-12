import { Distribution, prisma, Task } from "@maga/db";

async function fetchIndustryDistribution(
  securityCode: string,
): Promise<Distribution[]> {
  const ret = await fetch(
    `https://hongsehuojian.com/fundex-quote/security/component/industryDistribution?securityCode=${securityCode}&industryLevel=3&ts=${Date.now()}`,
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        pla: "rr_Mac",
        pragma: "no-cache",
        pro: "RedRocket-PC",
        ver: "",
        Referer: `https://hongsehuojian.com/index/h5/fundexh5bai/index.html?securityCode=${securityCode}&targetPage=indexDetail&pro=RedRocket-PC`,
      },
      body: null,
      method: "GET",
    },
  );
  const res = (await ret.json()) as {
    code: "200";
    data: {
      resultMap: {
        最新: Array<{
          industryName: string;
          weight: number;
        }>;
      };
    };
  };

  if (res.code !== "200") {
    return [];
  }

  return res.data.resultMap["最新"].map<Distribution>((item) => {
    return {
      code: securityCode,
      weight: item.weight,
      industryName: item.industryName,
    };
  });
}

export const getIndexDistributionTask = (
  securityCode: string,
): Task<Distribution[]> => ({
  name: `index-distribution-${securityCode}`,
  fetch: async () => fetchIndustryDistribution(securityCode),
  save: async (data) => {
    await prisma.$transaction(async (ctx) => {
      await ctx.distribution.deleteMany({
        where: {
          code: securityCode,
        },
      });

      await ctx.distribution.createMany({ data });
    });
  },
});
