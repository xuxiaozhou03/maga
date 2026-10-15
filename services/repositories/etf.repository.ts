/**
 * ETF 元数据访问层。
 *
 * ETF 由采集服务按白名单写入（见 `services/crawler/etfs.ts`），
 * 本层只做只读查询。
 */

import type { Etf } from "@prisma/client";
import { prisma } from "@/services/prisma";
import type { Ymd } from "@/lib/dates";

export type EtfRow = Etf;

export type EtfOrderBy = "code" | "scale";

export type EtfSummary = {
  code: string;
  name: string;
  trackingIndex: string;
  trackIndex: string;
  scale: number;
  /** 溢价率（百分数，0.02 表示 0.02%）。 */
  premiumRate: number | null;
  /** 行情覆盖情况。 */
  barCount: number;
  firstDate: Ymd | null;
  lastDate: Ymd | null;
  lastClose: number | null;
};

export type ListEtfsOptions = {
  orderBy?: EtfOrderBy;
  /** 只返回给定代码集合内的 ETF，用于多 ETF 回测校验。 */
  codes?: readonly string[];
};

/** 查询全部 ETF，默认按代码升序（代码即内部 `@@id`）。 */
export async function listEtfs(options: ListEtfsOptions = {}): Promise<EtfRow[]> {
  const { orderBy = "code", codes } = options;
  return prisma.etf.findMany({
    where: codes && codes.length > 0 ? { code: { in: [...codes] } } : undefined,
    orderBy: { [orderBy]: "asc" },
  });
}

/** 按代码查询单个 ETF，不存在返回 null。 */
export async function getEtf(code: string): Promise<EtfRow | null> {
  if (typeof code !== "string" || code.trim() === "") {
    throw new TypeError("etf.repository: code 不能为空");
  }
  return prisma.etf.findUnique({ where: { code } });
}

/** 返回全部 ETF 代码，用于校验回测配置里的 ETF 是否合法。 */
export async function listEtfCodes(): Promise<string[]> {
  const rows = await prisma.etf.findMany({ select: { code: true }, orderBy: { code: "asc" } });
  return rows.map((row) => row.code);
}

/**
 * ETF 列表及其行情覆盖情况，按规模从大到小。
 *
 * 覆盖信息用一次 groupBy 聚合，最新收盘价按代码各取一条。
 */
export async function listEtfSummaries(): Promise<EtfSummary[]> {
  const [etfs, grouped] = await Promise.all([
    prisma.etf.findMany({ orderBy: { scale: "desc" } }),
    prisma.kline.groupBy({
      by: ["code"],
      _min: { date: true },
      _max: { date: true },
      _count: { _all: true },
    }),
  ]);

  const coverage = new Map(grouped.map((item) => [item.code, item]));

  const lastCloses = await Promise.all(
    etfs.map((etf) =>
      prisma.kline.findFirst({
        where: { code: etf.code },
        orderBy: { date: "desc" },
        select: { close: true },
      }),
    ),
  );

  return etfs.map((etf, index) => {
    const stats = coverage.get(etf.code);
    return {
      code: etf.code,
      name: etf.name,
      trackingIndex: etf.trackingIndex,
      trackIndex: etf.trackIndex,
      scale: etf.scale,
      premiumRate: etf.premiumRate ?? null,
      barCount: stats?._count._all ?? 0,
      firstDate: stats?._min.date ?? null,
      lastDate: stats?._max.date ?? null,
      lastClose: lastCloses[index]?.close ?? null,
    };
  });
}
