import { describe, expect, it } from "vitest";
import { RANKING_CODES } from "../../src/domain/rankings.js";
import { calculateEtfRankings } from "../../src/rankings/etf-rankings.js";
import { calculateFilteredRanking } from "../../src/rankings/filtered-ranking.js";
import { calculateRiskScores } from "../../src/rankings/risk-score.js";
import { loadCalculationConfig } from "../calculations/support.js";
import { makeFeature, makeValuation } from "../support/features.js";

const ANALYSIS_DATE = "2026-11-13";
const CODES = ["A", "B", "C", "D", "E", "F"] as const;

async function makeFeatures() {
  const returns20d = [0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
  const volatility = [0.4, 0.3, 0.2, 0.1, 0.05, 0.01];
  const drawdown = [-0.4, -0.3, -0.2, -0.1, -0.05, -0.01];
  const amounts = [600, 500, 400, 300, 200, 100];
  const percentiles = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];

  return CODES.map((code, index) =>
    makeFeature({
      code,
      category:
        index < 5
          ? {
              primaryCode: "broad_market",
              secondaryCode: "cn_core",
              status: "confirmed",
            }
          : { primaryCode: "sector", secondaryCode: "technology", status: "confirmed" },
      returns: {
        "20d": returns20d[index] ?? null,
        "250d": index < 3 ? 0.05 * (index + 1) : null,
      },
      trend: { maAlignmentScore: 6 - index },
      risk: {
        volatility20d: volatility[index] ?? null,
        maxDrawdown60d: drawdown[index] ?? null,
      },
      activity: { averageAmount20d: amounts[index] ?? null },
      valuation: { pe: makeValuation(percentiles[index] ?? 0) },
    }),
  );
}

describe("calculateEtfRankings", () => {
  it("generates all 13 ranking files and never overall", async () => {
    const config = await loadCalculationConfig();
    const rankings = calculateEtfRankings({
      features: await makeFeatures(),
      analysisDate: ANALYSIS_DATE,
      snapshotVersion: 1,
      config,
    });

    expect(Object.keys(rankings).sort()).toEqual([...RANKING_CODES].sort());
    expect(Object.hasOwn(rankings, "overall")).toBe(false);
  });

  it("ranks returns and valuation percentiles in their configured directions", async () => {
    const config = await loadCalculationConfig();
    const rankings = calculateEtfRankings({
      features: await makeFeatures(),
      analysisDate: ANALYSIS_DATE,
      snapshotVersion: 1,
      config,
    });

    expect(rankings.return_20d).toMatchObject({
      direction: "desc",
      interpretation: "higher_is_better",
      eligibleCount: 6,
      insufficientSample: false,
    });
    expect(rankings.return_20d.items.map((item) => [item.code, item.rank])).toEqual([
      ["A", 1],
      ["B", 2],
      ["C", 3],
      ["D", 4],
      ["E", 5],
      ["F", 6],
    ]);
    expect(rankings.valuation_pe).toMatchObject({
      direction: "asc",
      interpretation: "neutral",
    });
    expect(rankings.valuation_pe.items[0]).toMatchObject({ code: "A", rank: 1 });
    expect(rankings.valuation_pe.items.at(-1)).toMatchObject({ code: "F", rank: 6 });
  });

  it("ranks lower composite risk first", async () => {
    const config = await loadCalculationConfig();
    const features = await makeFeatures();
    const riskScores = calculateRiskScores(features, config);
    const rankings = calculateEtfRankings({
      features,
      analysisDate: ANALYSIS_DATE,
      snapshotVersion: 1,
      config,
    });

    expect(riskScores).toEqual([
      { code: "A", value: 1 },
      { code: "B", value: 0.8 },
      { code: "C", value: 0.6 },
      { code: "D", value: 0.4 },
      { code: "E", value: 0.2 },
      { code: "F", value: 0 },
    ]);
    expect(rankings.risk_score).toMatchObject({
      direction: "asc",
      interpretation: "lower_is_better",
    });
    expect(rankings.risk_score.items.map((item) => item.code)).toEqual([
      "F",
      "E",
      "D",
      "C",
      "B",
      "A",
    ]);
  });

  it("returns empty items when a ranking has too few valid samples", async () => {
    const config = await loadCalculationConfig();
    const rankings = calculateEtfRankings({
      features: await makeFeatures(),
      analysisDate: ANALYSIS_DATE,
      snapshotVersion: 1,
      config,
    });

    expect(rankings.return_250d).toMatchObject({
      eligibleCount: 3,
      insufficientSample: true,
      items: [],
    });
  });
});

describe("calculateFilteredRanking", () => {
  it("keeps full-pool metadata and adds both rank scopes", async () => {
    const config = await loadCalculationConfig();
    const features = await makeFeatures();
    const fullPoolBefore = calculateEtfRankings({
      features,
      analysisDate: ANALYSIS_DATE,
      snapshotVersion: 1,
      config,
    });

    const result = calculateFilteredRanking({
      features,
      rankingCode: "return_20d",
      analysisDate: ANALYSIS_DATE,
      snapshotVersion: 1,
      config,
      filter: { primaryCode: "broad_market", secondaryCode: null },
    });
    const fullPoolAfter = calculateEtfRankings({
      features,
      analysisDate: ANALYSIS_DATE,
      snapshotVersion: 1,
      config,
    });

    expect(fullPoolAfter).toEqual(fullPoolBefore);
    expect(result).toMatchObject({
      scope: "filtered",
      fullPool: { rankingCode: "return_20d", eligibleCount: 6, insufficientSample: false },
      filtered: { eligibleCount: 5, insufficientSample: false },
    });
    expect(
      result.filtered.items.map((item) => [item.code, item.filteredRank, item.fullPoolRank]),
    ).toEqual([
      ["A", 1, 1],
      ["B", 2, 2],
      ["C", 3, 3],
      ["D", 4, 4],
      ["E", 5, 5],
    ]);
  });
});
