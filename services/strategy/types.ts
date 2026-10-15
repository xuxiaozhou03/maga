/**
 * 策略编写接口。
 *
 * 这是策略作者唯一需要 import 的模块：写策略时从这里拿 `defineStrategy`
 * 和上下文类型，不要直接依赖引擎内部实现。
 *
 * 策略以普通 TypeScript 文件形式放在 `services/strategy/` 下并提交到仓库，
 * 由 `pnpm strategy:run <文件>` 调试运行。
 */

import type { Strategy } from "@/services/backtest/engine/engine";

/**
 * 声明策略。
 *
 * 恒等函数，只用于获得完整的类型推导与参数/返回值检查：
 *
 * ```ts
 * export default defineStrategy({
 *   name: "均线交叉",
 *   params: { fast: 5, slow: 20 },
 *   onBar(ctx) {
 *     return { orders: [{ code: "510300.SH", side: "buy", percent: 1 }] };
 *   },
 * });
 * ```
 */
export function defineStrategy<P extends object, S = undefined>(
  definition: Strategy<P, S>,
): Strategy<P, S> {
  return definition;
}

export type {
  Strategy,
  StrategyContext,
  StrategyInitializeContext,
  IndicatorApi,
  BarView,
  MacdView,
  BollingerView,
} from "@/services/backtest/engine/engine";

export type {
  AccountSnapshot,
  BacktestConfig,
  OrderIntent,
  OrderSide,
  PositionSnapshot,
  StrategyResult,
} from "@/services/backtest/types";
