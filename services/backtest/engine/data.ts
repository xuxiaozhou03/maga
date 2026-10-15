/**
 * 行情装载与“引擎 + 数据库”的组合入口。
 *
 * 引擎本身保持纯同步；这里负责把 Prisma 数据按引擎需要的形状准备好。
 */

import { getKlinesWithWarmup } from "@/services/repositories/kline.repository";
import type { BacktestConfig, MarketSeries } from "@/services/backtest/types";
import { runBacktest, type RunBacktestResult, type Strategy } from "./engine";

/** 默认预热 K 线数量，足够长周期均线使用。 */
export const DEFAULT_WARMUP_BARS = 60;

/** 按回测配置从数据库加载各 ETF 的行情（含预热数据）。 */
export async function loadMarketSeries(
  config: BacktestConfig,
  warmupBars: number = DEFAULT_WARMUP_BARS,
): Promise<MarketSeries[]> {
  return Promise.all(
    config.codes.map(async (code) => {
      const { warmup, bars } = await getKlinesWithWarmup({
        code,
        startDate: config.startDate,
        endDate: config.endDate,
        warmupBars,
      });
      return { code, bars: [...warmup, ...bars] };
    }),
  );
}

/** 从数据库加载行情并运行回测。 */
export async function runBacktestOnDatabase<P extends object, S>(
  strategy: Strategy<P, S>,
  config: BacktestConfig,
  warmupBars: number = DEFAULT_WARMUP_BARS,
): Promise<RunBacktestResult> {
  const series = await loadMarketSeries(config, warmupBars);
  return runBacktest({ strategy, config, series });
}
