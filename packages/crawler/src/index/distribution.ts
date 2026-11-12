import { Task } from "@maga/db";

async function fetchIndustryDistribution(securityCode: string): Promise<any> {
  const ret = await fetch(
    `https://hongsehuojian.com/fundex-quote/security/component/industryDistribution?securityCode=${securityCode}&industryLevel=4&ts=${Date.now()}`,
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
    data: any;
  };

  if (res.code !== "200") {
    return null;
  }

  return res.data;
}

export const getIndexDistributionTask = (securityCode: string): Task<any> => ({
  name: `index-distribution-${securityCode}`,
  fetch: async () => fetchIndustryDistribution(securityCode),
  save: async (data) => {
    console.log(data);
  },
});
