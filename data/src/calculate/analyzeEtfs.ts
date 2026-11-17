/**
 * analyzeEtfs.ts
 *
 * ETF 横向分析
 *
 * 输入：
 *   以 ETF code 为 key 的 EtfFeatures 对象
 *
 * 输出：
 *   市场概览、各维度排名、客观分析结论
 *
 * 说明：
 * - 只使用 EtfFeatures 中已经定义的数据。
 * - 收益率、波动率、最大回撤、成交额变化比例均使用小数。
 * - 估值分位使用 0~1，例如 0.3 表示 30% 分位。
 * - 缺失值不参与排名和统计。
 * - 相同数值采用并列排名，例如 1、1、3。
 * - 不修改输入数据。
 */

import type {
  EtfFeatures,
  PerformancePeriod,
  PeriodPerformance,
} from "./etfFeature";

// ============================================================
// 1. 类型定义
// ============================================================

/**
 * ETF 特征集合
 *
 * key 为 ETF code。
 */
export type EtfFeatureMap = Record<string, EtfFeatures>;

type MetricValue = number | null | undefined;

type RankingDirection = "desc" | "asc";

/**
 * 单个排名项目
 */
export interface EtfRankingItem {
  /** 排名，相同数值并列 */
  rank: number;

  /** ETF 代码 */
  code: string;

  /** 排名数值 */
  value: number;
}

/**
 * 排名结果
 */
export interface EtfRanking {
  /** 排名方向 */
  direction: RankingDirection;

  /** 参与排名的 ETF 数量 */
  total: number;

  /** 排名列表 */
  items: EtfRankingItem[];
}

/**
 * 市场整体概览
 */
export interface EtfMarketOverview {
  /** ETF 总数 */
  total: number;

  /** 各周期 ETF 平均收益率 */
  averageReturns: Record<
    "1w" | "1m" | "3m" | "6m" | "ytd" | "1y" | "3y" | "5y",
    number | null
  >;
}

/**
 * 横向分析结论
 */
export interface EtfAnalysisInsight {
  type: "return" | "risk" | "activity" | "valuation";

  /** 结论标题 */
  title: string;

  /** 结论说明 */
  description: string;

  /** 涉及的 ETF 代码 */
  codes: string[];
}

/**
 * ETF 横向分析最终结果
 */
export interface EtfAnalysisResult {
  /** 市场整体概览 */
  overview: EtfMarketOverview;

  /** 各维度排名 */
  rankings: {
    /** 收益排名 */
    returns: {
      "1w": EtfRanking;
      "1m": EtfRanking;
      "3m": EtfRanking;
      "6m": EtfRanking;
      ytd: EtfRanking;
      "1y": EtfRanking;
      "3y": EtfRanking;
      "5y": EtfRanking;
    };

    /** 风险排名 */
    risk: {
      volatility1m: EtfRanking;
      volatility3m: EtfRanking;
      volatility6m: EtfRanking;
      volatility1y: EtfRanking;

      maxDrawdown1m: EtfRanking;
      maxDrawdown3m: EtfRanking;
      maxDrawdown6m: EtfRanking;
      maxDrawdown1y: EtfRanking;
    };

    /** 成交活跃度排名 */
    activity: {
      averageAmount1w: EtfRanking;
      averageAmount1m: EtfRanking;
      averageAmount3m: EtfRanking;
      amountChange1w: EtfRanking;
      amountChange1m: EtfRanking;
      amountChange3m: EtfRanking;
    };

    /** 估值历史分位排名 */
    valuation: {
      PE: EtfRanking;
      PB: EtfRanking;
      PS: EtfRanking;
    };
  };

  /** 客观分析结论 */
  insights: EtfAnalysisInsight[];
}

// ============================================================
// 2. 通用工具
// ============================================================

/**
 * 判断是否为有效数字
 */
function isValidNumber(value: MetricValue): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 平均值
 */
function average(values: number[]): number | null {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * 获取有效的 ETF 特征
 */
function getValidFeatures(etfs: EtfFeatureMap): EtfFeatures[] {
  return Object.values(etfs);
}

/**
 * 获取指定周期的表现数据
 */
function getPerformance(
  features: EtfFeatures,
  period: PerformancePeriod,
): PeriodPerformance {
  return features.performance[period];
}

// ============================================================
// 3. 排名计算
// ============================================================

/**
 * 通用排名计算
 *
 * getValue：
 *   获取最终展示的排名数值。
 *
 * getSortValue：
 *   获取用于排序的数值。
 *   如果不传，默认使用 getValue。
 *
 * direction：
 *   desc：数值越大越靠前。
 *   asc：数值越小越靠前。
 *
 * 相同数值采用并列排名。
 */
function createRanking(
  etfs: EtfFeatureMap,
  getValue: (features: EtfFeatures) => MetricValue,
  direction: RankingDirection,
  getSortValue?: (features: EtfFeatures) => MetricValue,
): EtfRanking {
  const items = Object.entries(etfs)
    .map(([code, features]) => {
      const value = getValue(features);
      const sortValue = getSortValue ? getSortValue(features) : value;

      return {
        code,
        value,
        sortValue,
      };
    })
    .filter(
      (
        item,
      ): item is {
        code: string;
        value: number;
        sortValue: number;
      } => isValidNumber(item.value) && isValidNumber(item.sortValue),
    )
    .sort((a, b) => {
      const diff =
        direction === "desc"
          ? b.sortValue - a.sortValue
          : a.sortValue - b.sortValue;

      return diff !== 0 ? diff : a.code.localeCompare(b.code);
    });

  let previousSortValue: number | null = null;
  let previousRank = 0;

  const rankedItems = items.map((item, index) => {
    const rank =
      previousSortValue !== null && item.sortValue === previousSortValue
        ? previousRank
        : index + 1;

    previousSortValue = item.sortValue;
    previousRank = rank;

    return {
      rank,
      code: item.code,
      value: item.value,
    };
  });

  return {
    direction,
    total: rankedItems.length,
    items: rankedItems,
  };
}

// ============================================================
// 4. 市场概览
// ============================================================

/**
 * 计算指定周期的 ETF 平均收益率
 */
function getAverageReturn(
  features: EtfFeatures[],
  period: PerformancePeriod,
): number | null {
  return average(
    features
      .map((item) => getPerformance(item, period).totalReturn)
      .filter(isValidNumber),
  );
}

/**
 * 构建市场整体概览
 */
function createOverview(etfs: EtfFeatureMap): EtfMarketOverview {
  const features = getValidFeatures(etfs);

  return {
    total: features.length,

    averageReturns: {
      "1w": getAverageReturn(features, "1w"),
      "1m": getAverageReturn(features, "1m"),
      "3m": getAverageReturn(features, "3m"),
      "6m": getAverageReturn(features, "6m"),
      ytd: getAverageReturn(features, "ytd"),
      "1y": getAverageReturn(features, "1y"),
      "3y": getAverageReturn(features, "3y"),
      "5y": getAverageReturn(features, "5y"),
    },
  };
}

// ============================================================
// 5. 客观分析结论
// ============================================================

/**
 * 生成客观分析结论
 *
 * 这里只描述统计结果，不生成买入、卖出等交易建议。
 */
function createInsights(
  rankings: EtfAnalysisResult["rankings"],
): EtfAnalysisInsight[] {
  const insights: EtfAnalysisInsight[] = [];

  // ----------------------------------------------------------
  // 近期收益表现
  // ----------------------------------------------------------

  const best1m = rankings.returns["1m"].items[0];
  const worst1m = rankings.returns["1m"].items.at(-1);

  if (best1m) {
    insights.push({
      type: "return",
      title: "近1个月表现领先",
      description:
        `${best1m.code} 近1个月收益率为 ` +
        `${(best1m.value * 100).toFixed(2)}%，` +
        "在有效数据的 ETF 中排名第一。",
      codes: [best1m.code],
    });
  }

  if (worst1m && worst1m.code !== best1m?.code) {
    insights.push({
      type: "return",
      title: "近1个月表现落后",
      description:
        `${worst1m.code} 近1个月收益率为 ` +
        `${(worst1m.value * 100).toFixed(2)}%，` +
        "在有效数据的 ETF 中排名最后。",
      codes: [worst1m.code],
    });
  }

  // ----------------------------------------------------------
  // 风险表现
  // ----------------------------------------------------------

  const lowestVolatility = rankings.risk.volatility1m.items[0];

  if (lowestVolatility) {
    insights.push({
      type: "risk",
      title: "近1个月波动率最低",
      description:
        `${lowestVolatility.code} 近1个月年化波动率为 ` +
        `${(lowestVolatility.value * 100).toFixed(2)}%。`,
      codes: [lowestVolatility.code],
    });
  }

  const lowestDrawdown = rankings.risk.maxDrawdown1m.items[0];

  if (lowestDrawdown) {
    insights.push({
      type: "risk",
      title: "近1个月最大回撤最小",
      description:
        `${lowestDrawdown.code} 近1个月最大回撤为 ` +
        `${(lowestDrawdown.value * 100).toFixed(2)}%。`,
      codes: [lowestDrawdown.code],
    });
  }

  // ----------------------------------------------------------
  // 成交活跃度
  // ----------------------------------------------------------

  const mostActive = rankings.activity.amountChange1m.items[0];

  if (mostActive) {
    const changePercent = mostActive.value * 100;

    insights.push({
      type: "activity",
      title: "成交额相对活跃",
      description:
        `${mostActive.code} 最新成交额相对于近1个月平均成交额 ` +
        `${changePercent >= 0 ? "增加" : "减少"} ` +
        `${Math.abs(changePercent).toFixed(2)}%。`,
      codes: [mostActive.code],
    });
  }

  // ----------------------------------------------------------
  // 估值分位
  // ----------------------------------------------------------

  const lowestPE = rankings.valuation.PE.items[0];

  if (lowestPE) {
    insights.push({
      type: "valuation",
      title: "PE估值历史分位最低",
      description:
        `${lowestPE.code} 跟踪指数的 PE 三年历史估值分位为 ` +
        `${(lowestPE.value * 100).toFixed(2)}%。` +
        "该指标仅反映历史分位，不代表未来收益或买入信号。",
      codes: [lowestPE.code],
    });
  }

  return insights;
}

// ============================================================
// 6. 主入口
// ============================================================

/**
 * ETF 横向分析
 *
 * @param etfs 以 ETF code 为 key 的 ETF 特征集合
 * @returns 市场概览、各维度排名、客观分析结论
 */
export function analyzeEtfs(etfs: EtfFeatureMap): EtfAnalysisResult {
  // ----------------------------------------------------------
  // 市场概览
  // ----------------------------------------------------------

  const overview = createOverview(etfs);

  // ----------------------------------------------------------
  // 各维度排名
  // ----------------------------------------------------------

  const rankings: EtfAnalysisResult["rankings"] = {
    // --------------------------------------------------------
    // 收益排名：收益率越高越靠前
    // --------------------------------------------------------

    returns: {
      "1w": createRanking(etfs, (f) => f.performance["1w"].totalReturn, "desc"),

      "1m": createRanking(etfs, (f) => f.performance["1m"].totalReturn, "desc"),

      "3m": createRanking(etfs, (f) => f.performance["3m"].totalReturn, "desc"),

      "6m": createRanking(etfs, (f) => f.performance["6m"].totalReturn, "desc"),

      ytd: createRanking(etfs, (f) => f.performance.ytd.totalReturn, "desc"),

      "1y": createRanking(etfs, (f) => f.performance["1y"].totalReturn, "desc"),

      "3y": createRanking(etfs, (f) => f.performance["3y"].totalReturn, "desc"),

      "5y": createRanking(etfs, (f) => f.performance["5y"].totalReturn, "desc"),
    },

    // --------------------------------------------------------
    // 风险排名
    //
    // 波动率：越低越靠前。
    // 最大回撤：按绝对值从小到大排序。
    // 展示值保留原始 maxDrawdown。
    // --------------------------------------------------------

    risk: {
      volatility1m: createRanking(
        etfs,
        (f) => f.performance["1m"].volatility,
        "asc",
      ),

      volatility3m: createRanking(
        etfs,
        (f) => f.performance["3m"].volatility,
        "asc",
      ),

      volatility6m: createRanking(
        etfs,
        (f) => f.performance["6m"].volatility,
        "asc",
      ),

      volatility1y: createRanking(
        etfs,
        (f) => f.performance["1y"].volatility,
        "asc",
      ),

      maxDrawdown1m: createRanking(
        etfs,
        (f) => f.performance["1m"].maxDrawdown,
        "asc",
        (f) => Math.abs(f.performance["1m"].maxDrawdown),
      ),

      maxDrawdown3m: createRanking(
        etfs,
        (f) => f.performance["3m"].maxDrawdown,
        "asc",
        (f) => Math.abs(f.performance["3m"].maxDrawdown),
      ),

      maxDrawdown6m: createRanking(
        etfs,
        (f) => f.performance["6m"].maxDrawdown,
        "asc",
        (f) => Math.abs(f.performance["6m"].maxDrawdown),
      ),

      maxDrawdown1y: createRanking(
        etfs,
        (f) => f.performance["1y"].maxDrawdown,
        "asc",
        (f) => Math.abs(f.performance["1y"].maxDrawdown),
      ),
    },

    // --------------------------------------------------------
    // 成交活跃度
    // --------------------------------------------------------

    activity: {
      averageAmount1w: createRanking(
        etfs,
        (f) => f.performance["1w"].averageAmount,
        "desc",
      ),

      averageAmount1m: createRanking(
        etfs,
        (f) => f.performance["1m"].averageAmount,
        "desc",
      ),

      averageAmount3m: createRanking(
        etfs,
        (f) => f.performance["3m"].averageAmount,
        "desc",
      ),

      amountChange1w: createRanking(
        etfs,
        (f) => f.performance["1w"].amountChange,
        "desc",
      ),

      amountChange1m: createRanking(
        etfs,
        (f) => f.performance["1m"].amountChange,
        "desc",
      ),

      amountChange3m: createRanking(
        etfs,
        (f) => f.performance["3m"].amountChange,
        "desc",
      ),
    },

    // --------------------------------------------------------
    // 估值排名
    //
    // 使用三年历史估值分位。
    // 分位越低，排名越靠前。
    // --------------------------------------------------------

    valuation: {
      PE: createRanking(etfs, (f) => f.valuation.PE["3y"].percentile, "asc"),

      PB: createRanking(etfs, (f) => f.valuation.PB["3y"].percentile, "asc"),

      PS: createRanking(etfs, (f) => f.valuation.PS["3y"].percentile, "asc"),
    },
  };

  // ----------------------------------------------------------
  // 客观分析结论
  // ----------------------------------------------------------

  const insights = createInsights(rankings);

  // ----------------------------------------------------------
  // 返回结果
  // ----------------------------------------------------------

  return {
    overview,
    rankings,
    insights,
  };
}
