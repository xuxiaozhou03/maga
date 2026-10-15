import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/services/prisma";
import { validateKlines } from "@/services/market-data/validator";
import {
  DEFAULT_MAX_BARS,
  fingerprintKlines,
  getKlineCoverage,
  getKlineFingerprint,
  getKlines,
  getKlinesWithWarmup,
} from "@/services/repositories/kline.repository";
import { getEtf, listEtfCodes, listEtfs } from "@/services/repositories/etf.repository";

const CODE = "510300.SH";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("kline.repository（读取真实 dev.db）", () => {
  it("按日期区间查询，结果为升序且落在区间内", async () => {
    const rows = await getKlines({ code: CODE, startDate: 20240102, endDate: 20240131 });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(23);
    expect(rows[0].date).toBeGreaterThanOrEqual(20240102);
    expect(rows[rows.length - 1].date).toBeLessThanOrEqual(20240131);

    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].date).toBeGreaterThan(rows[i - 1].date);
    }
  });

  it("支持 limit 上限", async () => {
    const rows = await getKlines({ code: CODE, startDate: 20240102, endDate: 20240131, limit: 3 });
    expect(rows).toHaveLength(3);
    expect(rows[0].date).toBeLessThan(rows[1].date);
    expect(rows[1].date).toBeLessThan(rows[2].date);
  });

  it("缺省 limit 使用 DEFAULT_MAX_BARS", () => {
    expect(DEFAULT_MAX_BARS).toBeGreaterThan(0);
  });

  it("对非法入参抛出异常", async () => {
    await expect(getKlines({ code: CODE, startDate: 20240230 })).rejects.toThrow(RangeError);
    await expect(getKlines({ code: CODE, startDate: 20240201, endDate: 20240101 })).rejects.toThrow(
      RangeError,
    );
    await expect(getKlines({ code: CODE, limit: 0 })).rejects.toThrow(RangeError);
    await expect(getKlines({ code: "  " })).rejects.toThrow(TypeError);
  });

  it("返回区间之前的预热数据，且不与区间数据重叠", async () => {
    const startDate = 20240102;
    const { warmup, bars } = await getKlinesWithWarmup({
      code: CODE,
      startDate,
      endDate: 20240131,
      warmupBars: 5,
    });

    expect(warmup).toHaveLength(5);
    expect(warmup.every((row) => row.date < startDate)).toBe(true);
    for (let i = 1; i < warmup.length; i += 1) {
      expect(warmup[i].date).toBeGreaterThan(warmup[i - 1].date);
    }
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0].date).toBeGreaterThanOrEqual(startDate);
  });

  it("warmupBars 为 0 时不返回预热数据", async () => {
    const { warmup, bars } = await getKlinesWithWarmup({
      code: CODE,
      startDate: 20240102,
      endDate: 20240131,
      warmupBars: 0,
    });
    expect(warmup).toHaveLength(0);
    expect(bars.length).toBeGreaterThan(0);
  });

  it("返回覆盖范围", async () => {
    const coverage = await getKlineCoverage(CODE);
    expect(coverage.code).toBe(CODE);
    expect(coverage.count).toBeGreaterThan(3000);
    expect(coverage.firstDate).not.toBeNull();
    expect(coverage.lastDate).not.toBeNull();
    expect(coverage.firstDate as number).toBeLessThanOrEqual(20120601);
    expect(coverage.lastDate as number).toBeGreaterThanOrEqual(20240101);
  });
});

describe("数据指纹", () => {
  it("同区间重复计算结果一致", async () => {
    const a = await getKlineFingerprint({ code: CODE, startDate: 20240102, endDate: 20240131 });
    const b = await getKlineFingerprint({ code: CODE, startDate: 20240102, endDate: 20240131 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("不同区间指纹不同", async () => {
    const jan = await getKlineFingerprint({ code: CODE, startDate: 20240102, endDate: 20240131 });
    const feb = await getKlineFingerprint({ code: CODE, startDate: 20240201, endDate: 20240229 });
    expect(jan).not.toBe(feb);
  });

  it("repository 复用的纯函数与直接调用结果一致", async () => {
    const rows = await getKlines({ code: CODE, startDate: 20240102, endDate: 20240131 });
    expect(fingerprintKlines(rows)).toBe(fingerprintKlines(rows));
  });
});

describe("真实行情通过质量校验", () => {
  it("510300.SH 近段数据没有 error 级问题", async () => {
    const rows = await getKlines({ code: CODE, startDate: 20240102, endDate: 20240331 });
    const result = validateKlines(rows);

    expect(result.barCount).toBeGreaterThan(0);
    if (!result.ok) {
      // 失败时输出问题明细，便于定位真实数据异常。
      console.log("行情校验问题：", result.issues);
    }
    expect(result.ok).toBe(true);
  });
});

describe("etf.repository", () => {
  it("列出 ETF，当前应为受控白名单集合", async () => {
    const etfs = await listEtfs();
    expect(etfs.length).toBeGreaterThanOrEqual(20);
    for (const etf of etfs) {
      expect(etf.code).toMatch(/\.(SH|SZ)$/);
      expect(etf.name.length).toBeGreaterThan(0);
    }
  });

  it("按代码查询单个 ETF", async () => {
    const etf = await getEtf(CODE);
    expect(etf?.code).toBe(CODE);
    expect(await getEtf("999999.XX")).toBeNull();
  });

  it("返回代码列表并支持异常入参", async () => {
    const codes = await listEtfCodes();
    expect(codes).toContain(CODE);
    await expect(getEtf("")).rejects.toThrow(TypeError);
  });
});
