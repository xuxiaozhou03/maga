import { Etf } from "./etfs";

/**
 * ETF 分类定义
 *
 * category 返回中文分类名称。
 * id 仅用于内部分类和排序。
 */
export const ETF_CATEGORIES = [
  // 宽基指数
  { id: "broad_large", name: "大盘宽基" },
  { id: "broad_dual", name: "双创宽基" },
  { id: "broad_small_mid", name: "中小盘宽基" },

  // 红利价值
  { id: "dividend_strategy", name: "红利策略" },
  { id: "dividend_low_vol", name: "红利低波" },
  { id: "value_quality", name: "价值质量" },
  { id: "growth_strategy", name: "成长策略" },

  // 科技
  { id: "ai_computing", name: "AI算力" },
  { id: "software_computer", name: "软件计算机" },
  { id: "communication", name: "通信" },
  { id: "electronics", name: "电子" },
  { id: "media_games", name: "传媒游戏" },
  { id: "hk_technology", name: "港股科技互联网" },
  { id: "semiconductor", name: "半导体" },

  // 医药
  { id: "domestic_medical", name: "国内医药医疗" },
  { id: "hk_medical", name: "港股医药医疗" },

  // 消费与金融
  { id: "consumption", name: "消费" },
  { id: "hk_consumption", name: "港股消费" },
  { id: "financial_real_estate", name: "金融地产" },
  { id: "hk_financial", name: "港股金融地产" },

  // 产业
  { id: "advanced_manufacturing", name: "高端制造" },
  { id: "new_energy", name: "新能源" },
  { id: "energy_resources", name: "能源资源" },
  { id: "public_utilities", name: "公用事业" },
  { id: "infrastructure", name: "基建工程" },
  { id: "military_aerospace", name: "军工航天" },
  { id: "agriculture", name: "农业养殖" },
  { id: "precious_metals", name: "贵金属商品" },

  // 海外市场
  { id: "us_stock", name: "美股" },
  { id: "non_us_stock", name: "非美股" },

  // 港股市场
  { id: "hk_broad", name: "港股宽基" },
  { id: "hk_dividend", name: "港股红利价值" },

  // 兜底
  { id: "other", name: "其他主题" },
] as const;

export type EtfCategory = (typeof ETF_CATEGORIES)[number]["id"];

export type EtfCategoryName = (typeof ETF_CATEGORIES)[number]["name"];

export interface ClassifiedEtf extends Etf {
  /** 中文分类名称 */
  category: EtfCategoryName;
}

/**
 * 判断文本是否包含任意一个关键词。
 */
function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

/**
 * 获取 ETF 的匹配文本。
 *
 * trackingIndex 是主要判断依据，name 用于补充。
 * 同时兼容部分 Etf 类型中存在 trackIndex 的情况。
 */
function getEtfText(etf: Etf): string {
  const extra = etf as Etf & {
    trackIndex?: string;
  };

  return [etf.name, etf.trackingIndex, extra.trackIndex]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * 是否明确属于港股市场。
 */
function isHongKongMarket(text: string): boolean {
  return includesAny(text, [
    "港股",
    "港股通",
    "恒生",
    "香港",
    "国企指数",
    "国企",
    "h股",
  ]);
}

/**
 * 是否明确属于美股市场。
 *
 * 标普A股红利、标普港股等特殊情况不在这里判断，
 * 由上层规则优先处理。
 */
function isUsMarket(text: string): boolean {
  if (includesAny(text, ["a股", "中国a股", "港股", "港股通", "恒生", "香港"])) {
    return false;
  }

  return includesAny(text, [
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
  ]);
}

/**
 * 是否属于非美股海外市场。
 *
 * 香港市场在前面单独处理，不会归入非美股。
 */
function isNonUsMarket(text: string): boolean {
  if (isHongKongMarket(text)) {
    return false;
  }

  return includesAny(text, [
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
    "中韩",
    "亚太",
    "欧洲",
    "英国",
    "澳洲",
    "澳大利亚",
    "全球市场",
    "全球指数",
  ]);
}

/**
 * 港股科技互联网。
 *
 * 特别将恒生科技、中概互联网、港股通互联网归为同一类。
 */
function isHongKongTechnology(text: string): boolean {
  return includesAny(text, [
    "恒生科技",
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
  ]);
}

/**
 * 港股医药医疗。
 */
function isHongKongMedical(text: string): boolean {
  return (
    isHongKongMarket(text) &&
    includesAny(text, [
      "创新药",
      "医药",
      "医疗",
      "医疗保健",
      "生物科技",
      "生物医药",
    ])
  );
}

/**
 * 港股红利价值。
 */
function isHongKongDividend(text: string): boolean {
  return (
    isHongKongMarket(text) &&
    includesAny(text, [
      "红利",
      "高股息",
      "高息",
      "高股息率",
      "股息",
      "低波红利",
      "红利低波",
      "央企红利",
    ])
  );
}

/**
 * 港股金融地产。
 */
function isHongKongFinancial(text: string): boolean {
  return (
    isHongKongMarket(text) &&
    includesAny(text, [
      "非银",
      "证券",
      "金融",
      "银行",
      "保险",
      "地产",
      "房地产",
    ])
  );
}

/**
 * 港股消费。
 */
function isHongKongConsumption(text: string): boolean {
  return (
    isHongKongMarket(text) &&
    includesAny(text, ["消费", "食品饮料", "旅游", "家电"])
  );
}

/**
 * 判断是否为双创宽基。
 *
 * 注意：
 * 科创芯片、科创创新药、创业板人工智能等具体行业 ETF
 * 不应该因为包含“科创”或“创业板”就归入双创宽基。
 */
function isDualBroad(text: string): boolean {
  return includesAny(text, [
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
  ]);
}

/**
 * 判断是否为中小盘宽基。
 */
function isSmallMidBroad(text: string): boolean {
  return includesAny(text, [
    "中证500",
    "中证800",
    "中证1000",
    "中证2000",
    "国证2000",
    "中小100",
    "中小板指",
    "中小盘",
  ]);
}

/**
 * 判断是否为大盘宽基。
 */
function isLargeBroad(text: string): boolean {
  return includesAny(text, [
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
  ]);
}

/**
 * 红利低波。
 */
function isDividendLowVol(text: string): boolean {
  return includesAny(text, [
    "红利低波",
    "低波红利",
    "红利低波50",
    "红利低波100",
    "高股息低波",
    "低波高股息",
  ]);
}

/**
 * 红利策略。
 */
function isDividendStrategy(text: string): boolean {
  return includesAny(text, [
    "红利",
    "股息",
    "高股息",
    "高息",
    "央企股东回报",
    "股东回报",
  ]);
}

/**
 * 价值质量。
 */
function isValueQuality(text: string): boolean {
  return includesAny(text, [
    "自由现金流",
    "现金流",
    "价值",
    "质量",
    "质量价值",
    "价值质量",
  ]);
}

/**
 * 成长策略。
 *
 * 只识别明确的成长风格指数，不使用宽泛的“成长”规则
 * 将创业板成长、科创成长等宽基错误归类。
 */
function isGrowthStrategy(text: string): boolean {
  return includesAny(text, ["成长100", "质量成长", "成长策略", "成长价值"]);
}

/**
 * AI算力。
 */
function isAiComputing(text: string): boolean {
  return includesAny(text, [
    "人工智能",
    "ai",
    "算力",
    "云计算",
    "大数据",
    "数据中心",
    "数据要素",
  ]);
}

/**
 * 软件计算机。
 */
function isSoftwareComputer(text: string): boolean {
  return includesAny(text, [
    "软件",
    "计算机",
    "信息技术",
    "信息产业",
    "网络安全",
    "网络信息",
    "数字经济",
    "数字技术",
  ]);
}

/**
 * 通信。
 */
function isCommunication(text: string): boolean {
  return includesAny(text, ["通信", "5g", "6g", "通信设备", "卫星通信"]);
}

/**
 * 电子。
 */
function isElectronics(text: string): boolean {
  return includesAny(text, ["电子", "消费电子", "电子元器件"]);
}

/**
 * 传媒游戏。
 */
function isMediaGames(text: string): boolean {
  return includesAny(text, [
    "传媒",
    "游戏",
    "动漫",
    "影视",
    "出版",
    "广告",
    "文化传媒",
  ]);
}

/**
 * 半导体。
 *
 * 优先于电子，避免芯片、半导体 ETF 被归入电子。
 */
function isSemiconductor(text: string): boolean {
  return includesAny(text, ["半导体", "芯片", "集成电路", "晶圆"]);
}

/**
 * 医药医疗。
 */
function isDomesticMedical(text: string): boolean {
  return includesAny(text, [
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
  ]);
}

/**
 * 消费。
 */
function isConsumption(text: string): boolean {
  return includesAny(text, [
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
  ]);
}

/**
 * 金融地产。
 */
function isFinancialRealEstate(text: string): boolean {
  return includesAny(text, [
    "证券",
    "非银",
    "银行",
    "金融",
    "保险",
    "房地产",
    "地产",
    "金融科技",
  ]);
}

/**
 * 军工航天。
 *
 * 军工、卫星、航空航天优先于普通高端制造。
 */
function isMilitaryAerospace(text: string): boolean {
  return includesAny(text, [
    "军工",
    "国防",
    "航空航天",
    "航天",
    "卫星产业",
    "卫星",
    "航空装备",
    "国防军工",
  ]);
}

/**
 * 新能源。
 *
 * 必须在能源资源之前判断，避免新能源被“能源”关键词截获。
 */
function isNewEnergy(text: string): boolean {
  return includesAny(text, [
    "新能源",
    "新能车",
    "新能源车",
    "电池",
    "光伏",
    "储能",
    "绿色电力",
    "绿电",
    "碳中和",
    "低碳",
    "风电",
    "氢能",
    "充电桩",
  ]);
}

/**
 * 公用事业。
 *
 * 普通电力指数归公用事业。
 * 绿色电力已经在新能源规则中优先处理。
 */
function isPublicUtilities(text: string): boolean {
  return includesAny(text, [
    "电力指数",
    "电力产业",
    "公用事业",
    "水务",
    "燃气",
  ]);
}

/**
 * 基建工程。
 */
function isInfrastructure(text: string): boolean {
  return includesAny(text, [
    "基建",
    "基础设施",
    "建筑工程",
    "建筑装饰",
    "工程建设",
  ]);
}

/**
 * 高端制造。
 */
function isAdvancedManufacturing(text: string): boolean {
  return includesAny(text, [
    "机器人",
    "工业母机",
    "机床",
    "工程机械",
    "智能制造",
    "高端制造",
    "智能驾驶",
    "汽车零部件",
    "电网设备",
    "新材料",
    "材料",
    "通用航空",
    "船舶",
    "工业自动化",
    "智能汽车",
    "汽车芯片",
  ]);
}

/**
 * 能源资源。
 */
function isEnergyResources(text: string): boolean {
  return includesAny(text, [
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
  ]);
}

/**
 * 农业养殖。
 */
function isAgriculture(text: string): boolean {
  return includesAny(text, [
    "农业",
    "养殖",
    "畜牧",
    "畜禽",
    "豆粕",
    "粮食",
    "种业",
    "农产品",
  ]);
}

/**
 * 贵金属商品。
 */
function isPreciousMetals(text: string): boolean {
  return includesAny(text, [
    "黄金",
    "上海金",
    "黄金9999",
    "贵金属",
    "白银",
    "金价",
  ]);
}

/**
 * 港股宽基。
 */
function isHongKongBroad(text: string): boolean {
  return includesAny(text, [
    "恒生指数",
    "恒生中国企业",
    "国企指数",
    "港股通50",
    "恒生港股通50",
    "香港上市30",
    "香港大盘",
    "恒生中国",
  ]);
}

/**
 * 获取 ETF 分类 ID。
 *
 * 匹配顺序非常重要：
 * 1. 港股细分行业
 * 2. 美股、非美股市场
 * 3. 国内细分行业
 * 4. 国内宽基
 * 5. 国内风格
 * 6. 其他
 */
export function getEtfCategory(etf: Etf): EtfCategory {
  const text = getEtfText(etf);

  const isHK = isHongKongMarket(text);

  // --------------------------------------------------
  // 一、港股细分行业优先处理
  // --------------------------------------------------

  // 恒生科技、中概互联网、港股通互联网统一分类
  if (isHongKongTechnology(text)) {
    return "hk_technology";
  }

  if (isHongKongMedical(text)) {
    return "hk_medical";
  }

  if (isHongKongDividend(text)) {
    return "hk_dividend";
  }

  if (isHongKongFinancial(text)) {
    return "hk_financial";
  }

  if (isHongKongConsumption(text)) {
    return "hk_consumption";
  }

  // --------------------------------------------------
  // 二、海外市场
  // --------------------------------------------------

  // 美股行业 ETF 也归入美股。
  // 例如纳指生物科技、标普生物科技、标普消费等。
  if (isUsMarket(text)) {
    return "us_stock";
  }

  // 日本、德国、法国、巴西、沙特、亚太等
  if (isNonUsMarket(text)) {
    return "non_us_stock";
  }

  // --------------------------------------------------
  // 三、国内具体行业
  // --------------------------------------------------

  if (isMilitaryAerospace(text)) {
    return "military_aerospace";
  }

  if (isSemiconductor(text)) {
    return "semiconductor";
  }

  if (isDomesticMedical(text)) {
    return "domestic_medical";
  }

  if (isAiComputing(text)) {
    return "ai_computing";
  }

  if (isSoftwareComputer(text)) {
    return "software_computer";
  }

  if (isCommunication(text)) {
    return "communication";
  }

  if (isMediaGames(text)) {
    return "media_games";
  }

  if (isElectronics(text)) {
    return "electronics";
  }

  if (isConsumption(text)) {
    return "consumption";
  }

  if (isFinancialRealEstate(text)) {
    return "financial_real_estate";
  }

  if (isNewEnergy(text)) {
    return "new_energy";
  }

  if (isPublicUtilities(text)) {
    return "public_utilities";
  }

  if (isInfrastructure(text)) {
    return "infrastructure";
  }

  if (isAdvancedManufacturing(text)) {
    return "advanced_manufacturing";
  }

  if (isEnergyResources(text)) {
    return "energy_resources";
  }

  if (isAgriculture(text)) {
    return "agriculture";
  }

  if (isPreciousMetals(text)) {
    return "precious_metals";
  }

  // --------------------------------------------------
  // 四、国内宽基
  // --------------------------------------------------

  // 具体行业已经在前面处理，因此科创芯片、创业板人工智能等
  // 不会因为名称中包含“科创”或“创业板”而被误归入双创宽基。
  if (isDualBroad(text)) {
    return "broad_dual";
  }

  if (isSmallMidBroad(text)) {
    return "broad_small_mid";
  }

  if (isLargeBroad(text)) {
    return "broad_large";
  }

  // --------------------------------------------------
  // 五、国内红利价值风格
  // --------------------------------------------------

  if (isDividendLowVol(text)) {
    return "dividend_low_vol";
  }

  if (isDividendStrategy(text)) {
    return "dividend_strategy";
  }

  if (isValueQuality(text)) {
    return "value_quality";
  }

  if (isGrowthStrategy(text)) {
    return "growth_strategy";
  }

  // --------------------------------------------------
  // 六、普通港股宽基兜底
  // --------------------------------------------------

  if (isHK && isHongKongBroad(text)) {
    return "hk_broad";
  }

  // 其他未识别的港股指数，仍然归入港股宽基，
  // 避免恒生、港股通类 ETF 混入国内行业分类。
  if (isHK) {
    return "hk_broad";
  }

  return "other";
}

/**
 * 将内部分类 ID 转为中文名称。
 */
const CATEGORY_NAME_MAP = new Map<EtfCategory, EtfCategoryName>(
  ETF_CATEGORIES.map((item) => [item.id, item.name]),
);

/**
 * 分类并排序 ETF。
 *
 * 排序规则：
 * 1. 按 ETF_CATEGORIES 定义的分类顺序排列。
 * 2. 同一分类内按 scale 从大到小排列。
 * 3. scale 相同时保持原始输入顺序。
 *
 * 返回扁平数组，不额外返回分类分组对象。
 */
export function classifyEtfs(etfs: Etf[]): ClassifiedEtf[] {
  const categoryOrder = new Map<EtfCategory, number>(
    ETF_CATEGORIES.map((item, index) => [item.id, index]),
  );

  return etfs
    .map((etf, originalIndex) => {
      const categoryId = getEtfCategory(etf);

      return {
        ...etf,
        category: CATEGORY_NAME_MAP.get(categoryId)!,
        categoryId,
        originalIndex,
      };
    })
    .sort((a, b) => {
      const categoryDiff =
        categoryOrder.get(a.categoryId)! - categoryOrder.get(b.categoryId)!;

      if (categoryDiff !== 0) {
        return categoryDiff;
      }

      const scaleDiff = (b.scale ?? 0) - (a.scale ?? 0);

      if (scaleDiff !== 0) {
        return scaleDiff;
      }

      return a.originalIndex - b.originalIndex;
    })
    .map(({ categoryId, originalIndex, ...etf }) => etf);
}
