/**
 * 行情（日 K）数据访问层。
 *
 * 对应 PRD 4.2：唯一的行情读取入口，统一以 `YYYYMMDD` 整数表达日期，
 * 并按日期升序返回。策略执行环境不得直接访问数据库，只能通过该层取数。
 */

import type { Kline } from "@prisma/client";
import { prisma } from "@/services/prisma";
import { isValidYmd, type Ymd } from "@/lib/dates";
import { fingerprintKlines } from "@/services/market-data/fingerprint";

export { fingerprintKlines };

export type KlineRow = Kline;

/** 单次查询默认返回上限，避免误查全量数据拖垮进程。 */
export const DEFAULT_MAX_BARS = 20_000;

export type KlineRangeQuery = {
  code: string;
  /** 起始日期（含），`YYYYMMDD`。 */
  startDate?: Ymd;
  /** 结束日期（含），`YYYYMMDD`。 */
  endDate?: Ymd;
  /** 返回条数上限，默认 `DEFAULT_MAX_BARS`。 */
  limit?: number;
};

export type KlineWarmupQuery = KlineRangeQuery & {
  /** 回测区间开始日期（含），预热数据取其之前的部分。 */
  startDate: Ymd;
  /** 需要多少根预热 K 线。 */
  warmupBars: number;
};

export type KlineWarmupResult = {
  /** 回测区间之前的预热数据，升序。 */
  warmup: KlineRow[];
  /** 回测区间内的数据，升序。 */
  bars: KlineRow[];
};

export type KlineCoverage = {
  code: string;
  count: number;
  firstDate: Ymd | null;
  lastDate: Ymd | null;
};

function assertCode(code: string): void {
  if (typeof code !== "string" || code.trim() === "") {
    throw new TypeError("kline.repository: code 不能为空");
  }
}

function assertOptionalDate(value: Ymd | undefined, label: string): void {
  if (value === undefined) return;
  if (!isValidYmd(value)) {
    throw new RangeError(`kline.repository: ${label} 不是合法的 YYYYMMDD 整数：${value}`);
  }
}

function assertLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_MAX_BARS;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`kline.repository: limit 必须是正整数，收到 ${limit}`);
  }
  return limit;
}

function buildWhere(query: KlineRangeQuery) {
  assertCode(query.code);
  assertOptionalDate(query.startDate, "startDate");
  assertOptionalDate(query.endDate, "endDate");

  if (
    query.startDate !== undefined &&
    query.endDate !== undefined &&
    query.startDate > query.endDate
  ) {
    throw new RangeError(
      `kline.repository: startDate(${query.startDate}) 晚于 endDate(${query.endDate})`,
    );
  }

  const date: { gte?: Ymd; lte?: Ymd } = {};
  if (query.startDate !== undefined) date.gte = query.startDate;
  if (query.endDate !== undefined) date.lte = query.endDate;

  return Object.keys(date).length > 0
    ? { code: query.code, date }
    : { code: query.code };
}

/** 按 ETF 代码 + 可选日期区间查询日 K，按日期升序返回。 */
export async function getKlines(query: KlineRangeQuery): Promise<KlineRow[]> {
  const where = buildWhere(query);
  const limit = assertLimit(query.limit);

  return prisma.kline.findMany({
    where,
    orderBy: { date: "asc" },
    take: limit,
  });
}

/**
 * 查询回测区间数据，并额外取区间之前的预热数据。
 *
 * 预热数据用于计算区间首日仍需的指标（如长周期均线），不会参与交易。
 */
export async function getKlinesWithWarmup(query: KlineWarmupQuery): Promise<KlineWarmupResult> {
  assertCode(query.code);
  assertOptionalDate(query.startDate, "startDate");
  assertOptionalDate(query.endDate, "endDate");

  if (!Number.isInteger(query.warmupBars) || query.warmupBars < 0) {
    throw new RangeError(
      `kline.repository: warmupBars 必须是非负整数，收到 ${query.warmupBars}`,
    );
  }

  const bars = await getKlines({
    code: query.code,
    startDate: query.startDate,
    endDate: query.endDate,
    limit: query.limit,
  });

  if (query.warmupBars === 0) {
    return { warmup: [], bars };
  }

  const descending = await prisma.kline.findMany({
    where: { code: query.code, date: { lt: query.startDate } },
    orderBy: { date: "desc" },
    take: query.warmupBars,
  });

  return { warmup: descending.reverse(), bars };
}

/** 查询单个 ETF 的行情覆盖范围（首末日与条数）。 */
export async function getKlineCoverage(code: string): Promise<KlineCoverage> {
  assertCode(code);

  const [count, first, last] = await Promise.all([
    prisma.kline.count({ where: { code } }),
    prisma.kline.findFirst({ where: { code }, orderBy: { date: "asc" } }),
    prisma.kline.findFirst({ where: { code }, orderBy: { date: "desc" } }),
  ]);

  return {
    code,
    count,
    firstDate: first?.date ?? null,
    lastDate: last?.date ?? null,
  };
}

/** 查询指定区间并计算数据指纹。 */
export async function getKlineFingerprint(query: KlineRangeQuery): Promise<string> {
  const rows = await getKlines(query);
  return fingerprintKlines(rows);
}
