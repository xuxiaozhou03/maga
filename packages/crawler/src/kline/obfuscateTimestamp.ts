/**
 * 把毫秒时间戳"混淆"成 URL 上的 t 参数。
 *
 * 规则：
 *   1. 取倒数第 4 位数字，作为"待搬运数字"
 *   2. 取末位数字 L：
 *        - L 为 0 → 搬到开头（第 1 位之前）
 *        - 否则   → 搬到第 L 位之前
 *
 * 输入 13 位 → 输出 14 位。
 */
export function obfuscateTimestamp(timestamp: number) {
  const digits = String(timestamp);
  const length = digits.length;

  // 待搬运的数字：倒数第 4 位
  const movedDigit = digits[length - 4];

  // 末位数字决定插入位置（1-based）
  const lastDigit = digits[length - 1];
  const insertPosition = lastDigit === "0" ? 2 : Number(lastDigit);

  // 插入到第 insertPosition 位之前 → 对应数组下标 insertPosition - 1
  const insertIndex = insertPosition - 1;

  return digits.slice(0, insertIndex) + movedDigit + digits.slice(insertIndex);
}
