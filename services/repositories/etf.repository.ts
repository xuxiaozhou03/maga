/**
 * ETF 元数据访问层。
 *
 * ETF 由采集服务按白名单写入（见 `services/crawler/etfs.ts`），
 * 本层只做只读查询。
 */

import type { Etf } from "@prisma/client";
import { prisma } from "@/services/prisma";

export type EtfRow = Etf;

export type EtfOrderBy = "code" | "scale";

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
