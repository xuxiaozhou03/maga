/**
 * 策略注册表。
 *
 * 策略以 TypeScript 文件形式写在 `services/strategy/`（示例见 `examples/`），
 * 由开发者编写、调试并提交到仓库。新增策略后在这里登记一次，Next.js 就能通过
 * `strategyId` 找到并执行它。
 *
 * 这里必须是静态 import：Next.js 需要静态依赖才能在打包时把策略一起带上，
 * 运行时按路径动态读取是行不通的。
 */

import type { Strategy } from "@/services/backtest/engine/engine";
import { buyAndHoldStrategy } from "./examples/buy-and-hold";
import { movingAverageCrossStrategy } from "./examples/moving-average-cross";

/** 擦除具体参数类型后的策略，供引擎与注册表统一持有。 */
export type RunnableStrategy = Strategy<Record<string, unknown>, unknown>;

export type RegisteredStrategy = {
  /** 稳定标识，API 与页面用它引用策略。 */
  id: string;
  name: string;
  description?: string;
  /** 策略声明的默认参数，供表单预填。 */
  params: Record<string, unknown>;
  strategy: RunnableStrategy;
};

const registry = new Map<string, RegisteredStrategy>();

function register(id: string, definition: unknown): void {
  if (registry.has(id)) {
    throw new Error(`策略 id 重复注册：${id}`);
  }

  const strategy = definition as RunnableStrategy;
  if (typeof strategy?.onBar !== "function") {
    throw new Error(`策略 ${id} 缺少 onBar`);
  }

  registry.set(id, {
    id,
    name: strategy.name,
    description: strategy.description,
    params: { ...((strategy.params as Record<string, unknown> | undefined) ?? {}) },
    strategy,
  });
}

register("buy-and-hold", buyAndHoldStrategy);
register("moving-average-cross", movingAverageCrossStrategy);

/** 全部已注册策略，按注册顺序。 */
export function listRegisteredStrategies(): RegisteredStrategy[] {
  return [...registry.values()];
}

/** 按 id 查询策略；不存在返回 undefined。 */
export function getRegisteredStrategy(id: string): RegisteredStrategy | undefined {
  return registry.get(id);
}

export { buyAndHoldStrategy, movingAverageCrossStrategy };
