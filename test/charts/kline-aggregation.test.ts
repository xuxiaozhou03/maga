import { describe, expect, it } from "vitest";
import { aggregateKlineRows, tradingWeekKey } from "../../src/charts/kline-aggregation.js";
import type { ChartKlineRow } from "../../src/domain/kline.js";

function row(
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  amount: number | null,
): ChartKlineRow {
  return { date, open, high, low, close, volume, amount };
}

describe("aggregateKlineRows", () => {
  const rows = [
    row("2026-01-29", 10, 12, 9.5, 11, 100, 1_000),
    row("2026-01-30", 11, 13, 10, 12, 200, 2_000),
    row("2026-02-02", 12, 14, 11, 13, 300, null),
    row("2026-02-03", 13, 15, 12, 14, 400, 4_000),
    row("2026-02-27", 14, 16, 13, 15, 500, 5_000),
    row("2026-03-02", 15, 17, 14, 16, 600, 6_000),
  ];

  it("aggregates weekly OHLCV and keeps missing amount as null", () => {
    expect(aggregateKlineRows(rows, "week")).toEqual([
      row("2026-01-30", 10, 13, 9.5, 12, 300, 3_000),
      row("2026-02-03", 12, 15, 11, 14, 700, null),
      row("2026-02-27", 14, 16, 13, 15, 500, 5_000),
      row("2026-03-02", 15, 17, 14, 16, 600, 6_000),
    ]);
  });

  it("aggregates monthly OHLCV", () => {
    expect(aggregateKlineRows(rows, "month")).toEqual([
      row("2026-01-30", 10, 13, 9.5, 12, 300, 3_000),
      row("2026-02-27", 12, 16, 11, 15, 1_200, null),
      row("2026-03-02", 15, 17, 14, 16, 600, 6_000),
    ]);
  });

  it("groups a trading week across a calendar-year boundary", () => {
    expect(tradingWeekKey("2025-12-31")).toBe("2025-12-29");
    expect(tradingWeekKey("2026-01-02")).toBe("2025-12-29");
  });

  it("rejects duplicate dates instead of double-counting volume", () => {
    expect(() =>
      aggregateKlineRows(
        [
          row("2026-01-29", 10, 12, 9, 11, 100, 1_000),
          row("2026-01-29", 10, 12, 9, 11, 100, 1_000),
        ],
        "week",
      ),
    ).toThrow("Duplicate Kline date");
  });
});
