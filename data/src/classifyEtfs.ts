import { Etf } from "./etfs";

export const ETF_CATEGORIES = [
  { id: "broad_large", name: "大盘宽基" },
  { id: "broad_dual", name: "双创宽基" },
  { id: "broad_small_mid", name: "中小盘宽基" },
  { id: "dividend", name: "红利价值" },
  { id: "technology", name: "科技成长" },
  { id: "semiconductor", name: "半导体" },
  { id: "healthcare", name: "医药医疗" },
  { id: "consumption", name: "消费" },
  { id: "finance", name: "金融地产" },
  { id: "advanced_manufacturing", name: "高端制造" },
  { id: "new_energy", name: "新能源" },
  { id: "energy_resources", name: "能源资源" },
  { id: "military_aerospace", name: "军工航天" },
  { id: "agriculture", name: "农业养殖" },
  { id: "precious_metals", name: "贵金属商品" },
  { id: "overseas", name: "海外宽基" },
  { id: "hk_market", name: "港股市场" },
  { id: "other", name: "其他主题" },
] as const;

export type EtfCategory = (typeof ETF_CATEGORIES)[number]["id"];

export type EtfCategoryName = (typeof ETF_CATEGORIES)[number]["name"];

export interface ClassifiedEtf extends Etf {
  category: EtfCategoryName;
}

/**
 * 判断 ETF 分类
 *
 * 根据 ETF 名称和跟踪指数名称进行分类。
 * 匹配顺序即分类优先级。
 */
function getEtfCategory(etf: Etf): EtfCategory {
  const text = `${etf.name} ${etf.trackingIndex}`.toLowerCase();

  const matches = (keywords: string[]) =>
    keywords.some((keyword) => text.includes(keyword.toLowerCase()));

  // 1. 半导体
  if (
    matches([
      "半导体",
      "芯片",
      "集成电路",
      "科创芯片",
      "半导体材料",
      "半导体设备",
    ])
  ) {
    return "semiconductor";
  }

  // 2. 医药医疗
  if (
    matches([
      "创新药",
      "医药",
      "医疗",
      "生物医药",
      "生物科技",
      "生物技术",
      "生物制药",
      "医疗器械",
      "中药",
      "制药",
      "疫苗",
      "医疗保健",
    ])
  ) {
    return "healthcare";
  }

  // 3. 军工航天
  if (
    matches([
      "军工",
      "国防",
      "航空航天",
      "航天",
      "卫星",
      "航空产业",
      "航空装备",
    ])
  ) {
    return "military_aerospace";
  }

  // 4. 贵金属商品
  if (
    matches(["黄金", "贵金属", "黄金股", "大宗商品", "商品期货", "商品指数"])
  ) {
    return "precious_metals";
  }

  // 5. 农业养殖
  if (
    matches(["农业", "养殖", "畜牧", "粮食", "农牧", "农渔", "农产品", "豆粕"])
  ) {
    return "agriculture";
  }

  // 6. 能源资源
  if (
    matches([
      "石油",
      "油气",
      "煤炭",
      "能源",
      "化工",
      "钢铁",
      "有色",
      "稀土",
      "矿业",
      "资源",
      "建材",
      "工业金属",
    ])
  ) {
    return "energy_resources";
  }

  // 7. 新能源
  if (
    matches([
      "新能源",
      "电池",
      "光伏",
      "储能",
      "绿色电力",
      "绿电",
      "碳中和",
      "新能源车",
      "电动车",
    ])
  ) {
    return "new_energy";
  }

  // 8. 金融地产
  if (matches(["银行", "证券", "券商", "保险", "金融", "房地产", "地产"])) {
    return "finance";
  }

  // 9. 高端制造
  if (
    matches([
      "机器人",
      "工业母机",
      "机床",
      "工程机械",
      "船舶",
      "智能制造",
      "智能驾驶",
      "汽车零部件",
      "电网设备",
      "高端装备",
      "机械设备",
      "工业4.0",
    ])
  ) {
    return "advanced_manufacturing";
  }

  // 10. 消费
  if (
    matches([
      "消费",
      "食品",
      "饮料",
      "白酒",
      "酒",
      "家电",
      "旅游",
      "免税",
      "零售",
      "农业消费",
      "消费电子",
      "影视",
      "动漫游戏",
      "游戏",
      "传媒",
      "文化",
    ])
  ) {
    return "consumption";
  }

  // 11. 红利价值
  if (
    matches([
      "红利",
      "股息",
      "高股息",
      "低波",
      "价值",
      "现金流",
      "质量",
      "成长",
    ])
  ) {
    return "dividend";
  }

  // 12. 科技成长
  if (
    matches([
      "人工智能",
      "ai",
      "科技",
      "软件",
      "计算机",
      "云计算",
      "算力",
      "通信",
      "数据",
      "信创",
      "信息技术",
      "信息产业",
      "数字经济",
      "tmt",
      "互联网",
      "科技创新",
    ])
  ) {
    return "technology";
  }

  // 13. 港股综合宽基
  if (
    matches([
      "恒生指数",
      "恒生中国企业",
      "恒生国企",
      "港股通50",
      "港股通综合",
      "港股通央企",
      "港股通宽基",
      "恒生综合",
    ])
  ) {
    return "hk_market";
  }

  // 14. 海外宽基
  if (
    matches([
      "纳斯达克100",
      "纳指100",
      "纳斯达克指数",
      "标普500",
      "标普100",
      "道琼斯",
      "日经225",
      "日经指数",
      "德国dax",
      "法国cac",
      "英国富时",
      "富时100",
      "巴西",
      "沙特",
      "印度",
      "越南",
      "东南亚",
      "美国50",
      "美国指数",
      "海外市场",
      "msci",
    ])
  ) {
    return "overseas";
  }

  // 15. 双创宽基
  if (
    matches([
      "创业板指数",
      "创业板指",
      "创业板综",
      "科创50",
      "科创100",
      "科创200",
      "科创综指",
      "双创",
      "科创创业",
    ])
  ) {
    return "broad_dual";
  }

  // 16. 中小盘宽基
  if (
    matches([
      "中证500",
      "中证1000",
      "中证2000",
      "中证800",
      "中证小盘",
      "中证中小盘",
      "中证全指",
      "中证全市场",
      "中证流通",
    ])
  ) {
    return "broad_small_mid";
  }

  // 17. 大盘宽基
  if (
    matches([
      "沪深300",
      "中证a500",
      "中证a100",
      "中证a50",
      "上证50",
      "上证180",
      "上证指数",
      "中证综合",
      "a股",
    ])
  ) {
    return "broad_large";
  }

  // 18. 其他主题
  return "other";
}

/**
 * ETF 分类及排序
 *
 * 1. 为 ETF 添加中文分类名称
 * 2. 按 ETF_CATEGORIES 定义的分类顺序排列
 * 3. 同分类内按规模从大到小排列
 * 4. 规模相同时保持原始输入顺序
 */
export function classifyEtfs(etfs: Etf[]): ClassifiedEtf[] {
  const categoryOrder = new Map(
    ETF_CATEGORIES.map((item, index) => [item.id, index]),
  );

  const categoryNameMap = new Map(
    ETF_CATEGORIES.map((item) => [item.id, item.name]),
  );

  return etfs
    .map((etf, index) => {
      const categoryId = getEtfCategory(etf);

      return {
        ...etf,
        category: categoryNameMap.get(categoryId)!,
        categoryId,
        originalIndex: index,
      };
    })
    .sort((a, b) => {
      // 按分类顺序
      const categoryDiff =
        categoryOrder.get(a.categoryId)! - categoryOrder.get(b.categoryId)!;

      if (categoryDiff !== 0) {
        return categoryDiff;
      }

      // 同分类按规模降序
      const scaleDiff = b.scale - a.scale;

      if (scaleDiff !== 0) {
        return scaleDiff;
      }

      // 规模相同保持原始顺序
      return a.originalIndex - b.originalIndex;
    })
    .map(({ categoryId, originalIndex, ...etf }) => etf);
}
