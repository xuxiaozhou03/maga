import { describe, expect, it } from "vitest";
import {
  validateKlines,
  type ValidatableBar,
} from "@/services/market-data/validator";

function bar(overrides: Partial<ValidatableBar> = {}): ValidatableBar {
  return {
    code: "510300.SH",
    date: 20240102,
    open: 3.5,
    high: 3.6,
    low: 3.45,
    close: 3.55,
    volume: 1_000_000,
    amount: 3_550_000,
    ...overrides,
  };
}

function rulesOf(bars: readonly ValidatableBar[], options?: Parameters<typeof validateKlines>[1]) {
  return validateKlines(bars, options).issues.map((issue) => issue.rule);
}

describe("validateKlines", () => {
  it("对干净的升序数据返回 ok", () => {
    const result = validateKlines([
      bar({ date: 20240102 }),
      bar({ date: 20240103 }),
      bar({ date: 20240104 }),
    ]);

    expect(result.ok).toBe(true);
    expect(result.barCount).toBe(3);
    expect(result.issues).toHaveLength(0);
  });

  it("识别重复日期", () => {
    const rules = rulesOf([bar({ date: 20240102 }), bar({ date: 20240102 })]);
    expect(rules).toContain("date.duplicate");
  });

  it("识别非升序排列", () => {
    const rules = rulesOf([bar({ date: 20240105 }), bar({ date: 20240102 })]);
    expect(rules).toContain("date.not_ascending");
  });

  it("识别非法日期", () => {
    expect(rulesOf([bar({ date: 20261301 })])).toContain("date.invalid");
  });

  it("识别 high < low", () => {
    const rules = rulesOf([bar({ high: 3.4, low: 3.45, open: 3.42, close: 3.43 })]);
    expect(rules).toContain("ohlc.high_below_low");
  });

  it("识别 high 低于实体上沿", () => {
    const rules = rulesOf([bar({ open: 3.5, close: 3.7, high: 3.6 })]);
    expect(rules).toContain("ohlc.high_below_body");
  });

  it("识别 low 高于实体下沿", () => {
    const rules = rulesOf([bar({ open: 3.5, close: 3.7, low: 3.6, high: 3.8 })]);
    expect(rules).toContain("ohlc.low_above_body");
  });

  it("识别非正数与无法解析的价格", () => {
    expect(rulesOf([bar({ close: 0 })])).toContain("price.non_positive");
    expect(rulesOf([bar({ open: NaN })])).toContain("price.non_finite");
  });

  it("识别负成交量与负成交额", () => {
    expect(rulesOf([bar({ volume: -1 })])).toContain("volume.negative");
    expect(rulesOf([bar({ amount: -1 })])).toContain("amount.negative");
  });

  it("把零成交量记为警告但不影响 ok", () => {
    const result = validateKlines([bar({ volume: 0, amount: 0 })]);
    expect(rulesOf([bar({ volume: 0, amount: 0 })])).toContain("volume.zero");
    expect(result.ok).toBe(true);
  });

  it("识别同一批次中出现不同 ETF 代码", () => {
    const rules = rulesOf([bar({ code: "510300.SH" }), bar({ code: "513100.SH", date: 20240103 })]);
    expect(rules).toContain("code.mismatch");
  });

  it("按阈值标记过大的日期缺口", () => {
    expect(rulesOf([bar({ date: 20240102 }), bar({ date: 20240130 })])).not.toContain("gap.large");
    expect(
      rulesOf([bar({ date: 20240102 }), bar({ date: 20240130 })], { maxGapDays: 7 }),
    ).toContain("gap.large");
  });

  it("把 error 级问题反映到 ok=false", () => {
    const result = validateKlines([bar({ high: 1, low: 2, open: 2, close: 1 })]);
    expect(result.ok).toBe(false);
    expect(result.issues.every((issue) => issue.severity === "error")).toBe(true);
  });
});
