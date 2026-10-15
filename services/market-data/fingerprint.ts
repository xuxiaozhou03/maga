/**
 * 行情数据指纹。
 *
 * 用于识别同一区间内行情是否被改写（见 PRD 2.4 / 8）。纯函数，不依赖数据库。
 */

import { createHash } from "node:crypto";

/** 计算指纹所需的最小字段集合。 */
export type FingerprintableBar = {
  code: string;
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  change: number;
  changePercent: number;
};

/**
 * 对一组按日期升序的 K 线计算 sha256 指纹。
 *
 * 相同输入必然得到相同结果；任何字段变化都会改变指纹。
 */
export function fingerprintKlines(rows: readonly FingerprintableBar[]): string {
  const hash = createHash("sha256");
  hash.update(`bars:${rows.length}`);
  for (const row of rows) {
    hash.update("\n");
    hash.update(
      [
        row.code,
        row.date,
        row.open,
        row.high,
        row.low,
        row.close,
        row.volume,
        row.amount,
        row.change,
        row.changePercent,
      ].join(","),
    );
  }
  return hash.digest("hex");
}
