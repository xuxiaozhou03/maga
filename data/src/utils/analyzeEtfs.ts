/**
 * ETF 横向分析
 *
 * 输入：以 ETF code 为 key 的 EtfFeatures 对象
 * 输出：市场概览、各维度排名、客观分析结论
 *
 * 约定：
 * - 收益率、波动率、回撤等自算指标使用小数。
 * - market.changePercent、premiumRate 保留上游百分数单位。
 * - 缺失值为 null 或 undefined 时，不参与排名和统计。
 * - 不修改输入数据。
 */

import { EtfFeatures } from "./calculateEtfFeatures";

export type EtfFeatureMap = Record<string, EtfFeatures>;

type MetricValue = number | null | undefined;

export interface EtfRankingItem {
  rank: number;
  code: string;
  name: string;
  value: number;
}

export interface EtfRanking {
  /** 排名方向 */
  direction: "desc" | "asc";
  /** 参与排名的 ETF 数量 */
  total: number;
  items: EtfRankingItem[];
}

export interface EtfMarketOverview {
  asOfDate: number | null;
  total: number;

  /** 根据最新交易日涨跌幅统计 */
  upCount: number;
  downCount: number;
  flatCount: number;
  changeCount: number;

  /** 全池平均涨跌幅，单位：百分数 */
  averageChangePercent: number | null;
  /** 全池涨跌幅中位数，单位：百分数 */
  medianChangePercent: number | null;

  /** 各周期 ETF 平均收益率，单位：小数 */
  averageReturns: {
    d1: number | null;
    d5: number | null;
    d20: number | null;
    d60: number | null;
    d120: number | null;
    d250: number | null;
    ytd: number | null;
  };
}

export interface EtfAnalysisInsight {
  type: "market" | "return" | "risk" | "activity" | "valuation";
  title: string;
  description: string;
  codes: string[];
}

export interface EtfAnalysisResult {
  asOfDate: number | null;
  overview: EtfMarketOverview;

  rankings: {
    returns: {
      d1: EtfRanking;
      d5: EtfRanking;
      d20: EtfRanking;
      d60: EtfRanking;
      d120: EtfRanking;
      d250: EtfRanking;
      ytd: EtfRanking;
    };

    risk: {
      volatility20: EtfRanking;
      volatility60: EtfRanking;
      volatility120: EtfRanking;
      maxDrawdown20: EtfRanking;
      maxDrawdown60: EtfRanking;
      maxDrawdown120: EtfRanking;
      maxDrawdown250: EtfRanking;
    };

    scale: EtfRanking;

    activity: {
      latestAmount: EtfRanking;
      averageAmount5: EtfRanking;
      averageAmount20: EtfRanking;
      amountRatio20: EtfRanking;
    };

    premium: {
      /** 按溢价率绝对值从小到大 */
      absolute: EtfRanking;
      /** 按溢价率从低到高 */
      ascending: EtfRanking;
      /** 按溢价率从高到低 */
      descending: EtfRanking;
    };

    valuation: {
      PE: EtfRanking;
      PB: EtfRanking;
      PS: EtfRanking;
    };
  };

  insights: EtfAnalysisInsight[];
}

/** 判断数值是否有效 */
function isValidNumber(value: MetricValue): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 平均值 */
function average(values: number[]): number | null {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 中位数 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

/**
 * 生成排名。
 *
 * desc：数值越大排名越靠前
 * asc：数值越小排名越靠前
 *
 * 相同数值使用并列排名，例如 1、1、3。
 */
function createRanking(
  etfs: EtfFeatureMap,
  getValue: (features: EtfFeatures) => MetricValue,
  direction: "desc" | "asc",
): EtfRanking {
  const items = Object.entries(etfs)
    .map(([code, features]) => ({
      code,
      name: features.name,
      value: getValue(features),
    }))
    .filter(
      (
        item,
      ): item is {
        code: string;
        name: string;
        value: number;
      } => isValidNumber(item.value),
    )
    .sort((a, b) => {
      const diff = direction === "desc" ? b.value - a.value : a.value - b.value;

      return diff !== 0 ? diff : a.code.localeCompare(b.code);
    });

  let previousValue: number | null = null;
  let previousRank = 0;

  const rankedItems = items.map((item, index) => {
    const rank =
      previousValue !== null && item.value === previousValue
        ? previousRank
        : index + 1;

    previousValue = item.value;
    previousRank = rank;

    return {
      rank,
      code: item.code,
      name: item.name,
      value: item.value,
    };
  });

  return {
    direction,
    total: rankedItems.length,
    items: rankedItems,
  };
}

/** 获取有效的 ETF 特征数据 */
function getValidFeatures(etfs: EtfFeatureMap): EtfFeatures[] {
  return Object.values(etfs);
}

/** 获取全池最新交易日期 */
function getLatestDate(etfs: EtfFeatureMap): number | null {
  const dates = getValidFeatures(etfs)
    .map((item) => item.data.latestDate)
    .filter((date) => isValidNumber(date));

  return dates.length > 0 ? Math.max(...dates) : null;
}

/** 构建市场概览 */
function createOverview(
  etfs: EtfFeatureMap,
  asOfDate: number | null,
): EtfMarketOverview {
  const features = getValidFeatures(etfs);

  const changes = features
    .map((item) => item.market.changePercent)
    .filter(isValidNumber);

  const upCount = changes.filter((value) => value > 0).length;
  const downCount = changes.filter((value) => value < 0).length;
  const flatCount = changes.filter((value) => value === 0).length;

  const getAverageReturn = (
    key: keyof EtfFeatures["returns"],
  ): number | null => {
    return average(
      features.map((item) => item.returns[key]).filter(isValidNumber),
    );
  };

  return {
    asOfDate,
    total: features.length,

    upCount,
    downCount,
    flatCount,
    changeCount: changes.length,

    averageChangePercent: average(changes),
    medianChangePercent: median(changes),

    averageReturns: {
      d1: getAverageReturn("d1"),
      d5: getAverageReturn("d5"),
      d20: getAverageReturn("d20"),
      d60: getAverageReturn("d60"),
      d120: getAverageReturn("d120"),
      d250: getAverageReturn("d250"),
      ytd: getAverageReturn("ytd"),
    },
  };
}

/** 生成客观分析结论 */
function createInsights(
  etfs: EtfFeatureMap,
  overview: EtfMarketOverview,
  rankings: EtfAnalysisResult["rankings"],
): EtfAnalysisInsight[] {
  const insights: EtfAnalysisInsight[] = [];

  if (overview.changeCount > 0) {
    const { upCount, downCount, flatCount, changeCount } = overview;

    if (upCount > downCount) {
      insights.push({
        type: "market",
        title: "市场上涨家数占优",
        description: `当前统计的 ${changeCount} 只 ETF 中，上涨 ${upCount} 只、下跌 ${downCount} 只、平盘 ${flatCount} 只。`,
        codes: [],
      });
    } else if (downCount > upCount) {
      insights.push({
        type: "market",
        title: "市场下跌家数占优",
        description: `当前统计的 ${changeCount} 只 ETF 中，上涨 ${upCount} 只、下跌 ${downCount} 只、平盘 ${flatCount} 只。`,
        codes: [],
      });
    } else {
      insights.push({
        type: "market",
        title: "市场涨跌家数接近",
        description: `当前统计的 ${changeCount} 只 ETF 中，上涨 ${upCount} 只、下跌 ${downCount} 只、平盘 ${flatCount} 只。`,
        codes: [],
      });
    }
  }

  /** 近期收益表现 */
  const best20 = rankings.returns.d20.items[0];
  const worst20 = rankings.returns.d20.items.at(-1);

  if (best20) {
    insights.push({
      type: "return",
      title: "近20日表现领先",
      description: `${best20.name} 近20日收益率为 ${(best20.value * 100).toFixed(2)}%，在有效数据的 ETF 中排名第一。`,
      codes: [best20.code],
    });
  }

  if (worst20 && worst20.code !== best20?.code) {
    insights.push({
      type: "return",
      title: "近20日表现落后",
      description: `${worst20.name} 近20日收益率为 ${(worst20.value * 100).toFixed(2)}%，在有效数据的 ETF 中排名最后。`,
      codes: [worst20.code],
    });
  }

  /** 低波动 ETF */
  const lowestVolatility = rankings.risk.volatility20.items[0];

  if (lowestVolatility) {
    insights.push({
      type: "risk",
      title: "近20日波动率最低",
      description: `${lowestVolatility.name} 近20日年化波动率为 ${(lowestVolatility.value * 100).toFixed(2)}%。`,
      codes: [lowestVolatility.code],
    });
  }

  /** 成交活跃度 */
  const mostActive = rankings.activity.amountRatio20.items[0];

  if (mostActive) {
    insights.push({
      type: "activity",
      title: "成交额相对活跃",
      description: `${mostActive.name} 最新成交额相对于近20日平均成交额的比例为 ${(mostActive.value * 100).toFixed(2)}%。`,
      codes: [mostActive.code],
    });
  }

  /** 估值分位 */
  const lowestPE = rankings.valuation.PE.items[0];

  if (lowestPE) {
    insights.push({
      type: "valuation",
      title: "PE估值分位最低",
      description: `${lowestPE.name} 跟踪指数的 PE 历史估值分位为 ${(lowestPE.value * 100).toFixed(2)}%。该指标仅反映历史分位，不代表未来收益或买入信号。`,
      codes: [lowestPE.code],
    });
  }

  return insights;
}

/**
 * 第二个核心业务函数
 */
export function analyzeEtfs(etfs: EtfFeatureMap): EtfAnalysisResult {
  // 检查输入 key 与特征中的 code 是否一致
  for (const [code, features] of Object.entries(etfs)) {
    if (code !== features.code) {
      throw new Error(
        `ETF code 不一致：对象 key 为 ${code}，EtfFeatures.code 为 ${features.code}`,
      );
    }
  }

  const asOfDate = getLatestDate(etfs);
  const overview = createOverview(etfs, asOfDate);

  const rankings: EtfAnalysisResult["rankings"] = {
    returns: {
      d1: createRanking(etfs, (f) => f.returns.d1, "desc"),
      d5: createRanking(etfs, (f) => f.returns.d5, "desc"),
      d20: createRanking(etfs, (f) => f.returns.d20, "desc"),
      d60: createRanking(etfs, (f) => f.returns.d60, "desc"),
      d120: createRanking(etfs, (f) => f.returns.d120, "desc"),
      d250: createRanking(etfs, (f) => f.returns.d250, "desc"),
      ytd: createRanking(etfs, (f) => f.returns.ytd, "desc"),
    },

    risk: {
      // 波动率越低，排名越靠前
      volatility20: createRanking(etfs, (f) => f.risk.volatility20, "asc"),
      volatility60: createRanking(etfs, (f) => f.risk.volatility60, "asc"),
      volatility120: createRanking(etfs, (f) => f.risk.volatility120, "asc"),

      // 回撤越接近 0，排名越靠前
      maxDrawdown20: createRanking(etfs, (f) => f.risk.maxDrawdown20, "desc"),
      maxDrawdown60: createRanking(etfs, (f) => f.risk.maxDrawdown60, "desc"),
      maxDrawdown120: createRanking(etfs, (f) => f.risk.maxDrawdown120, "desc"),
      maxDrawdown250: createRanking(etfs, (f) => f.risk.maxDrawdown250, "desc"),
    },

    scale: createRanking(etfs, (f) => f.scale, "desc"),

    activity: {
      latestAmount: createRanking(etfs, (f) => f.volume.latestAmount, "desc"),
      averageAmount5: createRanking(
        etfs,
        (f) => f.volume.averageAmount5,
        "desc",
      ),
      averageAmount20: createRanking(
        etfs,
        (f) => f.volume.averageAmount20,
        "desc",
      ),
      amountRatio20: createRanking(etfs, (f) => f.volume.amountRatio20, "desc"),
    },

    premium: {
      absolute: createRanking(
        etfs,
        (f) => (isValidNumber(f.premiumRate) ? Math.abs(f.premiumRate) : null),
        "asc",
      ),
      ascending: createRanking(etfs, (f) => f.premiumRate, "asc"),
      descending: createRanking(etfs, (f) => f.premiumRate, "desc"),
    },

    valuation: {
      // 估值分位越低，排名越靠前。
      // 这只是历史分位排序，不代表估值绝对高低。
      PE: createRanking(etfs, (f) => f.valuation.PE.percentile, "asc"),
      PB: createRanking(etfs, (f) => f.valuation.PB.percentile, "asc"),
      PS: createRanking(etfs, (f) => f.valuation.PS.percentile, "asc"),
    },
  };

  const insights = createInsights(etfs, overview, rankings);

  return {
    asOfDate,
    overview,
    rankings,
    insights,
  };
}
