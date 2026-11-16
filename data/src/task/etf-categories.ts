import { Etf } from "../type";

/**
 * ETF 匹配文本。
 */
function getEtfText(etf: Omit<Etf, "category">): string {
  const extra = etf as Etf & { trackIndex?: string };

  return [etf.name, etf.trackingIndex, extra.trackIndex]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * 关键词匹配。
 */
const keywords =
  (...words: string[]) =>
  (text: string) =>
    words.some((word) => text.includes(word));

const hk = keywords(
  "港股",
  "港股通",
  "恒生",
  "香港",
  "国企指数",
  "国企",
  "h股",
);

const us = (text: string) =>
  !keywords("a股", "中国a股", "港股", "港股通", "恒生", "香港")(text) &&
  keywords(
    "纳斯达克",
    "纳指",
    "nasdaq",
    "标普500",
    "标普",
    "s&p",
    "道琼斯",
    "道指",
    "dow jones",
    "msci美国",
    "美国50",
    "美国市场",
    "美股",
    "罗素",
  )(text);

const nonUs = (text: string) =>
  !hk(text) &&
  keywords(
    "日经",
    "东证",
    "东京",
    "日本",
    "德国",
    "dax",
    "法国",
    "cac40",
    "沙特",
    "巴西",
    "印度",
    "越南",
    "泰国",
    "印尼",
    "马来西亚",
    "新加坡",
    "韩国",
    "亚太",
    "欧洲",
    "英国",
    "澳洲",
    "澳大利亚",
    "全球市场",
    "全球指数",
  )(text);

/**
 * ETF 分类定义。
 *
 * match 顺序即分类优先级。
 * 每个 ETF 只会匹配第一个符合条件的分类。
 */
export const ETF_CATEGORIES = [
  // 港股细分行业
  {
    id: "hk_technology",
    name: "互联网",
    match: keywords(
      "互联网",
      "恒生互联网",
      "恒生港股通科技",
      "港股通科技",
      "港股通互联网",
      "港股科技",
      "港股通信息技术",
      "中国互联网",
      "全球中国互联网",
      "中概互联网",
      "中概互联",
    ),
  },
  {
    id: "hk_medical",
    name: "港股医药医疗",
    match: (text: string) =>
      hk(text) &&
      keywords(
        "创新药",
        "医药",
        "医疗",
        "医疗保健",
        "生物科技",
        "生物医药",
      )(text),
  },
  {
    id: "hk_dividend",
    name: "港股红利",
    match: (text: string) =>
      hk(text) &&
      keywords(
        "红利",
        "高股息",
        "高息",
        "高股息率",
        "股息",
        "低波红利",
        "红利低波",
        "央企红利",
      )(text),
  },
  {
    id: "hk_financial",
    name: "港股金融地产",
    match: (text: string) =>
      hk(text) &&
      keywords("非银", "证券", "金融", "银行", "保险", "地产", "房地产")(text),
  },

  // 海外市场
  { id: "us_stock", name: "美股", match: us },
  { id: "non_us_stock", name: "非美股", match: nonUs },

  // 国内行业
  {
    id: "military_aerospace",
    name: "军工",
    match: keywords(
      "军工",
      "国防",
      "航空航天",
      "航天",
      "卫星产业",
      "卫星",
      "航空装备",
      "国防军工",
    ),
  },
  {
    id: "semiconductor",
    name: "半导体",
    match: keywords("半导体", "芯片", "集成电路", "晶圆", "科创材料"),
  },
  {
    id: "domestic_medical",
    name: "国内医",
    match: keywords(
      "医药",
      "医疗",
      "创新药",
      "生物医药",
      "生物科技",
      "生物技术",
      "生物制药",
      "医疗器械",
      "中药",
      "医疗保健",
    ),
  },
  {
    id: "ai_computing",
    name: "AI算力",
    match: keywords(
      "人工智能",
      "ai",
      "算力",
      "云计算",
      "大数据",
      "数据中心",
      "数据要素",
    ),
  },
  {
    id: "software_computer",
    name: "科技",
    match: keywords(
      "软件",
      "计算机",
      "信息技术",
      "信息产业",
      "网络安全",
      "网络信息",
      "数字经济",
      "数字技术",
      "科技龙头",
      "科技50",
    ),
  },
  {
    id: "communication",
    name: "通信",
    match: keywords("通信", "5g", "6g", "通信设备", "卫星通信"),
  },
  {
    id: "media_games",
    name: "传媒游戏",
    match: keywords("传媒", "游戏", "动漫", "影视", "出版", "广告", "文化传媒"),
  },
  {
    id: "electronics",
    name: "电子",
    match: keywords("电子", "消费电子", "电子元器件"),
  },
  {
    id: "consumption",
    name: "消费",
    match: keywords(
      "消费",
      "食品饮料",
      "白酒",
      "酒",
      "家电",
      "旅游",
      "农产品消费",
      "免税",
      "零售",
      "汽车消费",
    ),
  },
  {
    id: "financial_real_estate",
    name: "金融地产",
    match: keywords(
      "证券",
      "非银",
      "银行",
      "金融",
      "保险",
      "房地产",
      "地产",
      "金融科技",
    ),
  },
  {
    id: "new_energy",
    name: "新能源",
    match: keywords(
      "新能源",
      "新能车",
      "新能源车",
      "电池",
      "光伏",
      "储能",
      "绿电",
      "碳中和",
      "低碳",
      "风电",
      "氢能",
      "充电桩",
    ),
  },
  {
    id: "public_utilities",
    name: "电力",
    match: keywords("电力指数", "电力产业", "绿色电力", "电网设备", "基建"),
  },
  {
    id: "advanced_manufacturing",
    name: "高端制造",
    match: keywords(
      "机器人",
      "工业母机",
      "机床",
      "工程机械",
      "智能制造",
      "高端制造",
      "智能驾驶",
      "汽车零部件",
      "新材料",
      "通用航空",
      "船舶",
      "工业自动化",
      "智能汽车",
      "汽车芯片",
    ),
  },
  {
    id: "energy_resources",
    name: "能源",
    match: keywords(
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
    ),
  },
  {
    id: "agriculture",
    name: "农业",
    match: keywords(
      "农业",
      "养殖",
      "畜牧",
      "畜禽",
      "豆粕",
      "粮食",
      "种业",
      "农产品",
    ),
  },
  {
    id: "precious_metals",
    name: "黄金",
    match: keywords("黄金", "上海金", "黄金9999", "贵金属", "白银", "金价"),
  },

  // 国内宽基
  {
    id: "broad_dual",
    name: "双创",
    match: keywords(
      "科创50",
      "科创100",
      "科创200",
      "科创综指",
      "科创创业50",
      "创业板指",
      "创业板50",
      "创业200",
      "创业板200",
      "创业大盘",
      "创业板成长",
      "创业成长",
      "科创成长",
    ),
  },
  {
    id: "broad_small_mid",
    name: "中小盘",
    match: keywords(
      "中证500",
      "中证800",
      "中证1000",
      "中证2000",
      "国证2000",
      "中小100",
      "中小板指",
      "中小盘",
    ),
  },
  {
    id: "broad_large",
    name: "大盘",
    match: keywords(
      "沪深300",
      "上证50",
      "上证指数",
      "上证180",
      "中证a50",
      "中证a500",
      "中证a100",
      "深证100",
      "深证成指",
      "深证综指",
      "a50",
      "大盘宽基",
      "成长100",
    ),
  },

  // 国内红利价值
  {
    id: "dividend_low_vol",
    name: "红利低波",
    match: keywords(
      "红利低波",
      "低波红利",
      "红利低波50",
      "红利低波100",
      "高股息低波",
      "低波高股息",
    ),
  },
  {
    id: "dividend_strategy",
    name: "红利策略",
    match: keywords(
      "红利",
      "股息",
      "高股息",
      "高息",
      "央企股东回报",
      "股东回报",
    ),
  },
  {
    id: "value_quality",
    name: "价值",
    match: keywords(
      "自由现金流",
      "现金流",
      "价值",
      "质量",
      "质量价值",
      "价值质量",
    ),
  },

  // 港股宽基及兜底
  {
    id: "hk_broad",
    name: "港股",
    match: hk,
  },
  {
    id: "other",
    name: "其他主题",
    match: () => true,
  },
] as const;

/**
 * 分类 ID 和名称类型。
 */
export type EtfCategory = (typeof ETF_CATEGORIES)[number]["id"];

export type EtfCategoryName = (typeof ETF_CATEGORIES)[number]["name"];

/**
 * 获取 ETF 分类。
 */
export function getEtfCategory(etf: Omit<Etf, "category">): EtfCategory {
  const text = getEtfText(etf);

  return ETF_CATEGORIES.find((item) => item.match(text))!.id;
}

/**
 * 分类并排序 ETF。
 *
 * 1. 按分类定义顺序排列。
 * 2. 同一分类按规模降序排列。
 * 3. 规模相同保持原始顺序。
 */
export function classifyEtfs(etfs: Omit<Etf, "category">[]): Etf[] {
  const categoryOrder = new Map(
    ETF_CATEGORIES.map((item, index) => [item.id, index]),
  );

  const categoryNames = new Map(
    ETF_CATEGORIES.map((item) => [item.id, item.name]),
  );

  return etfs
    .map((etf, originalIndex) => {
      const categoryId = getEtfCategory(etf);

      return {
        ...etf,
        category: categoryNames.get(categoryId)!,
        categoryId,
        originalIndex,
      };
    })
    .sort((a, b) => {
      const categoryDiff =
        categoryOrder.get(a.categoryId)! - categoryOrder.get(b.categoryId)!;

      return (
        categoryDiff ||
        (b.scale ?? 0) - (a.scale ?? 0) ||
        a.originalIndex - b.originalIndex
      );
    })
    .map(({ categoryId, originalIndex, ...etf }) => etf);
}
