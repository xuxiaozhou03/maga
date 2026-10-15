/**
 * 数值工具。
 *
 * 资金核算统一按 `MONEY_DIGITS` 位小数收敛，避免浮点误差在长序列中累积
 * （对应 PRD 13.4 的数值精度要求）。
 */

/** 资金与价格统一保留的小数位。 */
export const MONEY_DIGITS = 4;

/** 按指定小数位四舍五入。 */
export function round(value: number, digits: number = MONEY_DIGITS): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

/** 资金/价格统一收敛到 `MONEY_DIGITS` 位。 */
export function roundMoney(value: number): number {
  return round(value, MONEY_DIGITS);
}

/** 求和，先累加再统一收敛，减少中间误差。 */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return roundMoney(total);
}

/** 算术平均。空数组返回 null。 */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return sum(values) / values.length;
}

/** 样本标准差。样本数少于 2 时返回 null。 */
export function stdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values);
  if (avg === null) return null;
  const variance =
    values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** 判断两个金额是否在容差内相等（默认 1e-6）。 */
export function moneyEquals(a: number, b: number, tolerance = 1e-6): boolean {
  return Math.abs(a - b) <= tolerance;
}
