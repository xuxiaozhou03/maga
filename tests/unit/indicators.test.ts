import { describe, expect, it } from "vitest";
import {
  bollinger,
  ema,
  lastValue,
  macd,
  rsi,
  sma,
  valueAtOffset,
} from "@/services/backtest/indicators/indicators";

describe("sma", () => {
  it("前期为 null，之后为滚动均值", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("周期大于样本数时全为 null", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });

  it("拒绝非法周期", () => {
    expect(() => sma([1, 2, 3], 0)).toThrow(RangeError);
  });
});

describe("ema", () => {
  it("以 SMA 作为种子并按 k 递推", () => {
    // 种子 = mean(1,2,3) = 2；k = 0.5
    // i=3: 4*0.5 + 2*0.5 = 3；i=4: 5*0.5 + 3*0.5 = 4
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe("rsi", () => {
  it("单边上涨时为 100", () => {
    expect(rsi([1, 2, 3, 4, 5], 3)[4]).toBe(100);
  });

  it("单边下跌时为 0", () => {
    expect(rsi([5, 4, 3, 2, 1], 3)[4]).toBe(0);
  });

  it("样本不足时为 null", () => {
    expect(rsi([1, 2], 5).every((value) => value === null)).toBe(true);
  });
});

describe("macd", () => {
  it("DIF = EMA(fast) - EMA(slow)，HIST = DIF - DEA", () => {
    const values = Array.from({ length: 60 }, (_, i) => 10 + i * 0.5);
    const result = macd(values, 12, 26, 9);
    const fast = ema(values, 12);
    const slow = ema(values, 26);

    const last = values.length - 1;
    expect(result.dif[last]).toBeCloseTo((fast[last] as number) - (slow[last] as number), 10);
    expect(result.hist[last]).toBeCloseTo(
      (result.dif[last] as number) - (result.dea[last] as number),
      10,
    );
  });

  it("样本不足时 DIF 为 null", () => {
    expect(macd([1, 2, 3], 12, 26, 9).dif.every((value) => value === null)).toBe(true);
  });
});

describe("bollinger", () => {
  it("常数序列上下轨与中轨重合", () => {
    const result = bollinger([5, 5, 5, 5, 5], 3, 2);
    expect(result.middle[4]).toBe(5);
    expect(result.upper[4]).toBe(5);
    expect(result.lower[4]).toBe(5);
  });

  it("上下轨关于中轨对称", () => {
    const result = bollinger([1, 2, 3, 4, 5, 6], 3, 2);
    const upper = result.upper[5] as number;
    const middle = result.middle[5] as number;
    const lower = result.lower[5] as number;
    expect(upper - middle).toBeCloseTo(middle - lower, 10);
    expect(upper).toBeGreaterThan(middle);
  });
});

describe("lastValue / valueAtOffset", () => {
  it("跳过 null 取值", () => {
    const series = [null, null, 1, 2, 3];
    expect(lastValue(series)).toBe(3);
    expect(valueAtOffset(series, 1)).toBe(2);
    expect(valueAtOffset(series, 2)).toBe(1);
    expect(valueAtOffset(series, 3)).toBeNull();
  });

  it("全是 null 时返回 null", () => {
    expect(lastValue([null, null])).toBeNull();
  });
});
