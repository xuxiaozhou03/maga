import { Kline } from "@maga/db";
import { calculateDailyFeatures } from "./calculateDailyFeatures";
import { calculateStatistics } from "./calculateStatistics";
import { checkKlineQuality } from "./checkKlineQuality";
import { calculateForwardLabels } from "./forward";
import { SingleEtfCalculationResult } from "./types";

/**
 * 计算单只 ETF。
 * 该函数只依赖本只 ETF 的 K 线，不依赖其他 ETF。
 */
export function calculateSingleEtf(
  code: string,
  klines: Kline[],
): SingleEtfCalculationResult {
  const qualityCheck = checkKlineQuality(code, klines);

  if (!qualityCheck.passed) {
    return {
      code,
      success: false,
      error: `行情质量检查未通过: ${qualityCheck.messages.join("; ")}`,
      qualityCheck,
      statistics: [],
      dailyFeatures: [],
      forwardLabels: [],
    };
  }

  try {
    return {
      code,
      success: true,
      qualityCheck,
      statistics: calculateStatistics(code, klines),
      dailyFeatures: calculateDailyFeatures(code, klines),
      forwardLabels: calculateForwardLabels(code, klines),
    };
  } catch (err) {
    return {
      code,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      qualityCheck,
      statistics: [],
      dailyFeatures: [],
      forwardLabels: [],
    };
  }
}
