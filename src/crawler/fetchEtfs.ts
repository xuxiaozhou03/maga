import { fetchLinkFund } from "./fetchLinkFund";

interface OriginalEtf {
  securityName: string;
  securityCode: string;
  scale: number | null;
  trackingIndex: string | null;
  trackIndex: string | null;
  premiumRate: string | number | null;
  amount: string;
}
export type Etf = {
  code: string;
  name: string;
  trackingIndex: string;
  trackIndex: string;
  scale: number;
  premiumRate?: number | undefined;
  category: string;
};

const magaCodes = [
  "NDX.GI",
  "SPTR500N.SPI",
  "NDXTMC.GI",
  "SPX.GI",
  "DJI.GI",
  "750108.MI",
  "NBI.GI",
  "SPSIBI.SPI",
  "SP5CSSUP.SPI",
];

const filterEtfs = ({
  trackIndex,
  securityCode,
  securityName,
  scale,
  amount,
}: OriginalEtf) => {
  if (magaCodes.includes(trackIndex!)) {
    return true;
  }

  if (
    !securityCode ||
    !securityName ||
    !trackIndex ||
    ["短融", "债"].find((item) => securityName.includes(item)) ||
    // 规模小于 3 亿过滤掉
    scale! < 300000000 ||
    // (map[trackIndex] && map[trackIndex].scale > scale!) ||
    !amount ||
    Number(amount) < 13000000 ||
    ["560170.SH", "512090.SH", "159623.SZ"].includes(securityCode)
  ) {
    return false;
  }

  return true;
};

const getEtfCategory = (trackingIndex: string) => {
  const Categories = [
    {
      name: "农业",
      keywords: ["农业", "豆粕", "畜牧", "粮食"],
    },
    {
      name: "互联网",
      keywords: [
        "互联网",
        "港股通科技",
        "港股通中国科技",
        "港股通信息",
        "恒生科技",
        "港股科技",
      ],
    },
    {
      name: "军工",
      keywords: ["军工", "国防", "航天", "航空", "卫星"],
    },
    {
      name: "通信",
      keywords: ["通信"],
    },
    {
      name: "传媒游戏",
      keywords: ["传媒", "游戏", "影视"],
    },
    {
      name: "电子",
      keywords: ["电子"],
    },
    {
      name: "电力",
      keywords: ["电力", "电网", "基建"],
    },
    {
      name: "黄金",
      keywords: ["黄金", "上海金"],
    },
    {
      name: "半导体",
      keywords: ["半导体", "芯片", "集成电路", "科创材料", "半导"],
    },
    {
      name: "AI",
      keywords: ["AI", "算力", "云计算", "大数据", "人工智能", "人工智"],
    },
    {
      name: "科技",
      keywords: [
        "软件",
        "计算机",
        "全指信息",
        "科技龙头",
        "科技50",
        "中证数据",
      ],
    },
    {
      name: "美股",
      keywords: [
        "纳斯达克",
        "nasdaq",
        "标普500",
        "标普生物",
        "标普石油",
        "美国50",
        "道琼斯",
      ],
    },
    {
      name: "消费",
      keywords: ["消费", "食品", "酒", "家用电器", "旅游"],
    },
    {
      name: "金融",
      keywords: ["非银", "证券", "银行", "金融"],
    },
    {
      name: "地产",
      keywords: ["地产", "建筑"],
    },
    {
      name: "海外",
      keywords: ["亚太", "德国", "东证", "日经", "巴西", "沙特", "法国"],
    },
    {
      name: "双创",
      keywords: [
        "创业大盘",
        "创成长",
        "创业成长",
        "科创100",
        "创业板50",
        "创业板指",
        "创业200",
        "科创创业50",
        "科创50",
        "科创200",
        "科创综指",
      ],
    },
    {
      name: "中小盘",
      keywords: ["国证2000", "中证2000", "中证1000", "中证800", "中证500"],
    },
    {
      name: "大盘",
      keywords: [
        "中证A500",
        "上证50",
        "沪深300",
        "300成长",
        "成长100",
        "深证100",
        "中国A50",
        "中证A50",
        "深证成指",
        "上证180",
        "上证指数",
      ],
    },
    {
      name: "港股",
      keywords: ["恒生指数", "国企指数", "港股通50"],
    },
    {
      name: "制造",
      keywords: ["机床", "机器人", "CNIROBOT", "机械", "船舶"],
    },
    {
      name: "红利",
      keywords: ["红利", "高股息", "高息"],
    },
    {
      name: "医",
      keywords: ["医", "药", "生物", "生科"],
    },
    {
      name: "新能源",
      keywords: ["新能", "电池", "CNIESBI", "光伏", "低碳", "智汽车"],
    },
    {
      name: "能源",
      keywords: [
        "有色",
        "稀有金属",
        "稀土",
        "煤炭",
        "石油",
        "油气",
        "天然气",
        "石化",
        "化工",
        "能源",
        "钢铁",
        "建材",
        "工业金属",
        "矿业",
        "资源",
        "上证商品",
        "能化",
        "稀金属",
      ],
    },
    {
      name: "价值",
      keywords: [
        "自由现金流",
        "现金流",
        "价值",
        "质量",
        "质量价值",
        "价值质量",
      ],
    },
  ] as const;
  return Categories.find((cate) => {
    return cate.keywords.find((key) => trackingIndex.includes(key));
  })?.name;
};

export async function fetchEtfs() {
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
  const etfMap = res.data.data.filter(filterEtfs).reduce(
    (prev, cur) => {
      const category = getEtfCategory(cur.trackingIndex!);
      if (!category) {
        return prev;
      }
      const etf: Etf = {
        code: cur.securityCode,
        name: cur.securityName,
        scale: cur.scale ?? 0,
        trackIndex: cur.trackIndex!,
        trackingIndex: cur.trackingIndex!,
        premiumRate: cur.premiumRate
          ? parseFloat(cur.premiumRate + "")
          : undefined,
        category,
      };
      if (magaCodes.includes(cur.trackIndex!)) {
        prev[`maga_${etf.code}`] = etf;
        return prev;
      }

      if (!prev[etf.trackIndex] || prev[etf.trackIndex].scale < etf.scale) {
        prev[etf.trackIndex] = etf;
        return prev;
      }

      return prev;
    },
    {} as Record<string, Etf>,
  );
  const etfs = Object.values(etfMap).sort((a, b) =>
    a.scale > b.scale ? -1 : 1,
  );
  console.log(etfs.length);
  const codes = etfs
    .filter((etf) => !magaCodes.includes(etf.code))
    .map((etf) => etf.code);
  const linkFunds = await Promise.all(
    codes.map((code) => fetchLinkFund(code, codes)),
  );
  const repeatCodes = linkFunds.flat(1).map((linkFund) => {
    if (
      etfs.findIndex((etf) => etf.code === linkFund.target) >
      etfs.findIndex((etf) => etf.code === linkFund.source)
    ) {
      return linkFund.target;
    }
    return linkFund.source;
  });
  console.log("repeat", [...new Set(repeatCodes)]);
  return etfs.filter((etf) => !repeatCodes.includes(etf.code));
}
