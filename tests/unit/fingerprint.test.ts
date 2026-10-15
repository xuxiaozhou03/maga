import { describe, expect, it } from "vitest";
import { fingerprintKlines, type FingerprintableBar } from "@/services/market-data/fingerprint";

function bar(overrides: Partial<FingerprintableBar> = {}): FingerprintableBar {
  return {
    code: "510300.SH",
    date: 20240102,
    open: 3.5,
    high: 3.6,
    low: 3.45,
    close: 3.55,
    volume: 1_000_000,
    amount: 3_550_000,
    change: 0.05,
    changePercent: 1.43,
    ...overrides,
  };
}

describe("fingerprintKlines", () => {
  it("对相同输入稳定返回同一个指纹", () => {
    const rows = [bar({ date: 20240102 }), bar({ date: 20240103 })];
    expect(fingerprintKlines(rows)).toBe(fingerprintKlines([...rows]));
  });

  it("任何字段变化都会改变指纹", () => {
    const base = [bar({ date: 20240102 })];
    expect(fingerprintKlines(base)).not.toBe(
      fingerprintKlines([bar({ date: 20240102, close: 3.56 })]),
    );
  });

  it("条数不同指纹不同", () => {
    expect(fingerprintKlines([bar()])).not.toBe(
      fingerprintKlines([bar(), bar({ date: 20240103 })]),
    );
  });

  it("空数组也有稳定指纹", () => {
    expect(fingerprintKlines([])).toBe(fingerprintKlines([]));
    expect(fingerprintKlines([])).not.toBe(fingerprintKlines([bar()]));
  });
});
