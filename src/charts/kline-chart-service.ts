import type { DateString, EtfCode } from "../sources/types.js";
import type { ChartKlineRow, KlineCacheFile } from "../domain/kline.js";
import { getLastTradingDay } from "../domain/trading-calendar.js";
import { aggregateKlineRows, type KlineAggregationPeriod } from "./kline-aggregation.js";
import type { DailyKlineSource, KlineCacheService } from "./kline-cache-service.js";

export type KlineChartPeriod = "day" | KlineAggregationPeriod;

export interface KlineChartOptions {
  period: KlineChartPeriod;
  analysisDate: DateString;
  limit: number;
  source?: DailyKlineSource;
}

export class KlineChartService {
  constructor(private readonly cache: KlineCacheService) {}

  async getChart(code: EtfCode, options: KlineChartOptions): Promise<ChartKlineRow[]> {
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 1000) {
      throw new RangeError(`Kline chart limit must be between 1 and 1000: ${options.limit}`);
    }

    let cache = await this.cache.read(code, options.analysisDate);
    if ((cache === null || isStale(cache, options.analysisDate)) && options.source) {
      await this.cache.refresh(code, options.analysisDate, options.source);
      cache = await this.cache.read(code, options.analysisDate);
    }
    if (!cache) {
      return [];
    }

    const rows =
      options.period === "day" ? cache.rows : aggregateKlineRows(cache.rows, options.period);
    return rows.slice(-options.limit);
  }
}

export function isStale(cache: KlineCacheFile, analysisDate: DateString): boolean {
  const latest = cache.rows.at(-1)?.date;
  if (latest === undefined) {
    return true;
  }
  const date = new Date(`${analysisDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  const previousTradingDay = getLastTradingDay(date);
  return latest < previousTradingDay;
}
