import { resolve } from "path";
import { etfsData } from "../data";
import { fetchKline } from "../fetch/klines";
import { fetchIndexValuation } from "../fetch/valuation";
import { Etf } from "../type";
import {
  calculateEtfFeatures,
  EtfFeatures,
} from "../utils/calculateEtfFeatures";
import { getToFile, saveToFile } from "../utils/file";

type CsvColumn = {
  header: string;
  get: (f: EtfFeatures) => unknown;
};

/**
 * 固定 CSV 字段定义
 */
const CSV_COLUMNS: CsvColumn[] = [
  // ETF
  { header: "code", get: (f) => f.etf.code },
  { header: "name", get: (f) => f.etf.name },
  { header: "scale", get: (f) => f.etf.scale },
  { header: "trackingIndex", get: (f) => f.etf.trackingIndex },
  { header: "trackIndex", get: (f) => f.etf.trackIndex },
  { header: "premiumRate", get: (f) => f.etf.premiumRate },

  // Data
  { header: "data_latestDate", get: (f) => f.data.latestDate },
  { header: "data_earliestDate", get: (f) => f.data.earliestDate },
  { header: "data_totalTradingDays", get: (f) => f.data.totalTradingDays },

  // Market
  ...(
    [
      "close",
      "change",
      "changePercent",
      "high",
      "low",
      "volume",
      "amount",
    ] as const
  ).map((key) => ({
    header: `market_${key}`,
    get: (f: EtfFeatures) => f.market[key],
  })),

  // Performance
  ...(["1w", "1m", "3m", "6m", "ytd", "1y", "3y", "5y"] as const).flatMap(
    (period) => {
      const metrics = [
        "totalReturn",
        "annualizedReturn",
        "dailyReturnMean",
        "dailyReturnMedian",
        "volatility",
        "maxDrawdown",
      ] as const;

      const stats = [
        "upDays",
        "downDays",
        "flatDays",
        "upDayRatio",
        "downDayRatio",
        "maxConsecutiveUpDays",
        "maxConsecutiveDownDays",
        "currentConsecutiveUpDays",
        "currentConsecutiveDownDays",
        "averageUpReturn",
        "averageDownReturn",
        "largestDailyGain",
        "largestDailyLoss",
        "gainLossRatio",
        "averageAmount",
        "medianAmount",
        "minAmount",
        "maxAmount",
        "amountStdDev",
        "amountChange",
        "activeDays",
        "activeDayRatio",
      ] as const;

      return [
        ...metrics.flatMap((metric) => [
          {
            header: `performance_${period}_${metric}_value`,
            get: (f: EtfFeatures) => f.performance[period][metric].value,
          },
          {
            header: `performance_${period}_${metric}_analysis`,
            get: (f: EtfFeatures) => f.performance[period][metric].analysis,
          },
        ]),
        ...(["startDate", "endDate", "tradingDays"] as const).map((key) => ({
          header: `performance_${period}_${key}`,
          get: (f: EtfFeatures) => f.performance[period][key],
        })),
        ...stats.map((key) => ({
          header: `performance_${period}_${key}`,
          get: (f: EtfFeatures) => f.performance[period][key],
        })),
      ];
    },
  ),

  // Moving averages
  ...(["ma5", "ma10", "ma20", "ma60", "ma120", "ma250"] as const).flatMap(
    (key) => [
      {
        header: `movingAverages_${key}_value`,
        get: (f: EtfFeatures) => f.movingAverages[key].value,
      },
      {
        header: `movingAverages_${key}_analysis_trend`,
        get: (f: EtfFeatures) => f.movingAverages[key].analysis.trend,
      },
      {
        header: `movingAverages_${key}_analysis_pricePosition`,
        get: (f: EtfFeatures) => f.movingAverages[key].analysis.pricePosition,
      },
    ],
  ),

  ...(["alignment", "dispersion"] as const).map((key) => ({
    header: `movingAverages_analysis_${key}`,
    get: (f: EtfFeatures) => f.movingAverages.analysis[key],
  })),

  ...(["ma5Ma20", "ma10Ma60"] as const).map((key) => ({
    header: `movingAverages_analysis_cross_${key}`,
    get: (f: EtfFeatures) => f.movingAverages.analysis.cross[key],
  })),

  // MA deviation
  ...(["ma5", "ma10", "ma20", "ma60", "ma120", "ma250"] as const).map(
    (key) => ({
      header: `maDeviation_${key}`,
      get: (f: EtfFeatures) => f.maDeviation[key].value,
    }),
  ),

  // Bollinger
  ...(["daily", "weekly", "monthly"] as const).flatMap((period) => {
    const fields = [
      "upper",
      "middle",
      "lower",
      "bandwidth",
      "percentB",
    ] as const;

    return [
      ...fields.flatMap((field) => [
        {
          header: `bollinger_${period}_value_${field}`,
          get: (f: EtfFeatures) => f.bollinger[period].value[field].value,
        },
        {
          header: `bollinger_${period}_value_${field}_analysis`,
          get: (f: EtfFeatures) => f.bollinger[period].value[field].analysis,
        },
      ]),
      ...(
        [
          "position",
          "bandwidthTrend",
          "squeeze",
          "priceSignal",
          "middleTrend",
        ] as const
      ).map((key) => ({
        header: `bollinger_${period}_analysis_${key}`,
        get: (f: EtfFeatures) => f.bollinger[period].analysis[key],
      })),
    ];
  }),

  // Valuation
  ...(["PE", "PB", "PS"] as const).flatMap((type) => {
    const base = [
      "value",
      "peg",
      "date",
      "delayDays",
      "analysis_status",
    ] as const;

    const historyFields = [
      "min",
      "max",
      "mean",
      "median",
      "stdDev",
      "percentile",
      "deviation",
      "zScore",
    ] as const;

    return [
      ...base.map((key) => ({
        header: `valuation_${type}_${key}`,
        get: (f: EtfFeatures) => {
          const v = f.valuation[type];
          return key === "analysis_status" ? v.analysis.status : v[key];
        },
      })),
      ...(["1y", "3y", "5y", "all"] as const).flatMap((period) =>
        historyFields.map((field) => ({
          header: `valuation_${type}_history_${period}_${field}`,
          get: (f: EtfFeatures) =>
            f.valuation[type].analysis.history[period][field],
        })),
      ),
    ];
  }),
];
const header = CSV_COLUMNS.map((column) => escapeCsv(column.header)).join(",");

const runEtfFeatures = async (etf: Etf) => {
  const klines = await fetchKline(etf.code);
  const pe = await fetchIndexValuation(etf.trackIndex, "PE");
  const pb = await fetchIndexValuation(etf.trackIndex, "PB");
  const ps = await fetchIndexValuation(etf.trackIndex, "PS");
  const etfFeatures = calculateEtfFeatures(etf, klines, [...pe, ...pb, ...ps]);

  let original = getToFile("features.csv");
  if (original === "") {
    original = header;
  }

  saveToFile(`features.csv`, original + "\n" + etfFeaturesToCsv(etfFeatures));
};

export const runEtfFeaturesTask = async () => {
  const etfs = etfsData.get().slice(0, 2);
  for await (const etf of etfs) {
    await runEtfFeatures(etf);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

/**
 * CSV 转义
 */
function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = String(value);

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * 输入一个 EtfFeatures，返回表头 + 一条数据记录
 */
export function etfFeaturesToCsv(f: EtfFeatures): string {
  const row = CSV_COLUMNS.map((column) => escapeCsv(column.get(f))).join(",");

  return row;
}
