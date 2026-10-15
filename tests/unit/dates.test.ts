import { describe, expect, it } from "vitest";
import { formatYmd, isValidYmd, parseYmd, toYmd } from "@/lib/dates";

describe("isValidYmd", () => {
  it("接受合法的 YYYYMMDD 整数", () => {
    expect(isValidYmd(20261015)).toBe(true);
    expect(isValidYmd(20120528)).toBe(true);
    expect(isValidYmd(20240229)).toBe(true); // 闰年
  });

  it("拒绝非法日历日期", () => {
    expect(isValidYmd(20260230)).toBe(false);
    expect(isValidYmd(20261301)).toBe(false);
    expect(isValidYmd(20260000)).toBe(false);
    expect(isValidYmd(20230029)).toBe(false); // 平年 2 月 29 日
  });

  it("拒绝非整数、字符串和越界值", () => {
    expect(isValidYmd("20261015")).toBe(false);
    expect(isValidYmd(20261015.5)).toBe(false);
    expect(isValidYmd(2026101)).toBe(false);
    expect(isValidYmd(NaN)).toBe(false);
    expect(isValidYmd(18991231)).toBe(false);
    expect(isValidYmd(30000101)).toBe(false);
  });
});

describe("parseYmd / formatYmd", () => {
  it("解析为年月日", () => {
    expect(parseYmd(20240105)).toEqual({ year: 2024, month: 1, day: 5 });
    expect(parseYmd(20261301)).toBeNull();
  });

  it("格式化为 ISO 风格日期", () => {
    expect(formatYmd(20240105)).toBe("2024-01-05");
    expect(formatYmd(20261015)).toBe("2026-10-15");
    expect(formatYmd(20261301)).toBeNull();
  });
});

describe("toYmd", () => {
  it("接受 - 与 / 分隔的完整日期", () => {
    expect(toYmd("2024-01-05")).toBe(20240105);
    expect(toYmd("2024/01/05")).toBe(20240105);
  });

  it("拒绝非法或非补零输入", () => {
    expect(toYmd("2024-1-5")).toBeNull();
    expect(toYmd("2024-13-05")).toBeNull();
    expect(toYmd("20240230")).toBeNull();
    expect(toYmd("not-a-date")).toBeNull();
  });
});
