import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { selectEtfPool } from "../../src/collectors/etf-pool-selector.js";
import type { RawEtf } from "../../src/sources/contracts.js";

async function readRawEtfs(): Promise<RawEtf[]> {
  const path = new URL("../fixtures/raw-etfs.json", import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as RawEtf[];
}

describe("selectEtfPool", () => {
  it("applies basic filters, deduplicates track indexes, and sorts by scale", async () => {
    const selection = selectEtfPool(await readRawEtfs());

    expect(selection.sourceTotal).toBe(13);
    expect(selection.afterBasicFilter).toBe(7);
    expect(selection.items.map((etf) => etf.code)).toEqual([
      "510300.SH",
      "588001.SH",
      "510050.SH",
      "512002.SH",
      "512007.SH",
    ]);
    expect(selection.reasons).toEqual({
      missing_code: 1,
      missing_name: 1,
      missing_track_index: 1,
      debt_name: 1,
      scale_missing_or_invalid: 1,
      scale_below_threshold: 0,
      amount_invalid: 1,
      amount_below_threshold: 1,
      duplicate_track_index: 2,
    });
    expect(selection.duplicateGroups).toBe(2);
    expect(selection.maxGroupSize).toBe(2);
    expect(selection.rejected).toHaveLength(8);
  });

  it("uses amount and then code as deterministic deduplication tie-breakers", async () => {
    const raw = await readRawEtfs();
    const selection = selectEtfPool(raw);

    const scienceAmount = selection.items.find((etf) => etf.code === "510300.SH");
    expect(scienceAmount?.amount).toBe(3489035700);

    const tieWinner = selection.items.find((etf) => etf.trackIndex === "000688.SH");
    expect(tieWinner?.code).toBe("588001.SH");

    const codeTie = selectEtfPool([
      {
        securityName: "A",
        securityCode: "512100.SH",
        scale: 500_000_000,
        trackIndex: "000100.SH",
        amount: null,
      },
      {
        securityName: "B",
        securityCode: "512099.SH",
        scale: 500_000_000,
        trackIndex: "000100.SH",
        amount: null,
      },
    ]);
    expect(codeTie.items[0]?.code).toBe("512099.SH");
  });

  it("keeps an invalid amount as null and only records a warning", async () => {
    const selection = selectEtfPool(await readRawEtfs());
    const invalidAmount = selection.items.find((etf) => etf.code === "512002.SH");

    expect(invalidAmount?.amount).toBeNull();
    expect(selection.reasons.amount_invalid).toBe(1);
    expect(selection.rejected.some((item) => item.code === "512002.SH")).toBe(false);
  });

  it("normalizes premiumRate zero and percent values without truthiness bugs", async () => {
    const selection = selectEtfPool(await readRawEtfs());

    expect(selection.items.find((etf) => etf.code === "510050.SH")?.premiumRate).toBe(0);
    expect(selection.items.find((etf) => etf.code === "510300.SH")?.premiumRate).toBeCloseTo(
      -0.0024,
    );
  });
});
