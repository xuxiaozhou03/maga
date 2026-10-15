import { describe, expect, it } from "vitest";
import { parsePremiumRate } from "@/services/crawler/etfs";

describe("parsePremiumRate", () => {
  it("解析上游返回的字符串百分数", () => {
    // 上游形如 "0.02"、"-0.10"，单位就是百分数
    expect(parsePremiumRate("0.02")).toBe(0.02);
    expect(parsePremiumRate("-0.10")).toBe(-0.1);
    expect(parsePremiumRate("0.00")).toBe(0);
  });

  it("兼容数字输入", () => {
    expect(parsePremiumRate(0.05)).toBe(0.05);
    expect(parsePremiumRate(-1.2)).toBe(-1.2);
  });

  it("上游为空时返回 null", () => {
    expect(parsePremiumRate(null)).toBeNull();
    expect(parsePremiumRate(undefined)).toBeNull();
    expect(parsePremiumRate("")).toBeNull();
    expect(parsePremiumRate("   ")).toBeNull();
  });

  it("无法解析时返回 null，不写入 NaN", () => {
    expect(parsePremiumRate("N/A")).toBeNull();
    expect(parsePremiumRate("--")).toBeNull();
    expect(parsePremiumRate({})).toBeNull();
    expect(parsePremiumRate([])).toBeNull();
  });
});
