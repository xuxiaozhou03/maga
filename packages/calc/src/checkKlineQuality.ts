/* ============================================================
 * 三、行情质量检查（单只 ETF）
 * ============================================================ */

import { Kline } from "@maga/db";
import { DataQualityCheck } from "./types";
import { sortKlines, isFiniteNumber } from "./utils";

export function checkKlineQuality(
  code: string,
  rawKlines: Kline[],
): DataQualityCheck {
  const klines = sortKlines(rawKlines);
  const messages: string[] = [];
  let priceInvalidCount = 0;
  let dateInvalidCount = 0;

  const seenDates = new Set<number>();
  let duplicateDateCount = 0;

  for (const k of klines) {
    if (!isFiniteNumber(k.date)) dateInvalidCount++;
    if (seenDates.has(k.date)) duplicateDateCount++;
    seenDates.add(k.date);

    const prices = [k.open, k.high, k.low, k.close];
    if (prices.some((p) => !isFiniteNumber(p) || p <= 0)) priceInvalidCount++;
    if (k.high < k.low) priceInvalidCount++;
  }

  if (dateInvalidCount > 0)
    messages.push(`存在 ${dateInvalidCount} 条非法日期`);
  if (duplicateDateCount > 0)
    messages.push(`存在 ${duplicateDateCount} 条重复日期`);
  if (priceInvalidCount > 0)
    messages.push(`存在 ${priceInvalidCount} 条非法价格`);

  const validKlines = klines.filter(
    (k) =>
      isFiniteNumber(k.date) &&
      [k.open, k.high, k.low, k.close].every(
        (p) => isFiniteNumber(p) && p > 0,
      ) &&
      k.high >= k.low,
  );

  return {
    code,
    totalRows: klines.length,
    validRows: validKlines.length,
    missingDates: 0,
    priceInvalidCount,
    dateInvalidCount,
    coverageStart: validKlines.length ? validKlines[0].date : null,
    coverageEnd: validKlines.length
      ? validKlines[validKlines.length - 1].date
      : null,
    passed:
      validKlines.length > 0 &&
      priceInvalidCount === 0 &&
      dateInvalidCount === 0,
    messages,
  };
}
