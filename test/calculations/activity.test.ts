import { describe, expect, it } from "vitest";
import { calculateActivity } from "../../src/calculations/activity.js";
import { loadCalculationConfig, rowsFromCloses } from "./support.js";

describe("calculateActivity", () => {
  it("passes exactly at the 80% sample ratio", async () => {
    const config = await loadCalculationConfig();
    const rows = rowsFromCloses(
      Array.from({ length: 20 }, () => 100),
      { amount: (index) => (index < 4 ? null : 100) },
    );

    const result = calculateActivity(rows, config);
    expect(result).toMatchObject({
      amount: 100,
      averageAmount5d: 100,
      averageAmount20d: 100,
      amountRatio20d: 0,
      amountSampleCount20d: 16,
    });
    expect(result.averageAmount60d).toBeNull();
  });

  it("returns null averages below the 80% sample ratio", async () => {
    const config = await loadCalculationConfig();
    const rows = rowsFromCloses(
      Array.from({ length: 20 }, () => 100),
      { amount: (index) => (index < 5 ? null : 100) },
    );

    const result = calculateActivity(rows, config);
    expect(result.averageAmount20d).toBeNull();
    expect(result.amountRatio20d).toBeNull();
    expect(result.amountSampleCount20d).toBe(15);
  });
});
