import { describe, expect, it } from "vitest";
import { ETF_RULES } from "../../src/rules/etf-rules.js";
import { evaluateRules } from "../../src/rules/rule-engine.js";
import { makeFeature, makeValuation } from "../support/features.js";
import { loadRuleConfig, makeRuleContext, onlyRules, ruleByCode } from "../support/rules.js";

async function makeEtfRuleFeatures() {
  const peers = ["B", "C", "D", "E"].map((code, index) =>
    makeFeature({
      code,
      returns: { "20d": 0.4 - index * 0.05, "60d": 0.3 - index * 0.05 },
    }),
  );
  return [
    makeFeature({
      code: "A",
      returns: { "20d": 0.5, "60d": 0.4 },
      trend: {
        close: 10,
        ma5: 9.8,
        ma10: 9.6,
        ma20: 9.4,
        ma60: 9,
        ma20Deviation: 0.1,
        aboveMa20: true,
        maAlignment: "bullish",
        maAlignmentScore: 6,
      },
      risk: {
        volatility20d: 0.4,
        volatility60d: 0.2,
        currentDrawdown: -0.15,
        maxDrawdown60d: -0.2,
      },
      activity: {
        amount: 25_000_000,
        averageAmount20d: 20_000_000,
        amountRatio20d: 0.6,
        amountSampleCount20d: 20,
      },
      valuation: {
        pe: makeValuation(0.1, 1),
        pb: makeValuation(0.1, 1),
        ps: makeValuation(0.1, 1),
      },
    }),
    ...peers,
  ];
}

describe("ETF rule definitions", () => {
  it("evaluates all 11 ETF rules with traceable evidence", async () => {
    const config = await loadRuleConfig();
    const context = await makeRuleContext(await makeEtfRuleFeatures(), new Map([["A", 3]]));
    const drafts = ETF_RULES.flatMap((definition) =>
      definition.evaluate(context, ruleByCode(config, definition.code)),
    );
    const byRule = new Map(drafts.map((draft) => [draft.ruleCode, draft]));

    expect(byRule.size).toBe(11);
    expect([...byRule.keys()].sort()).toEqual(ETF_RULES.map((rule) => rule.code).sort());
    expect([...byRule.values()].every((draft) => draft.etfCode === "A")).toBe(true);

    expect(byRule.get("etf_return20d_top20")?.evidence).toMatchObject({
      return20d: 0.5,
      rankPercentile: 1,
      rank: 1,
    });
    expect(byRule.get("etf_bullish_alignment")?.evidence).toMatchObject({
      close: 10,
      ma5: 9.8,
      ma10: 9.6,
      ma20: 9.4,
      ma60: 9,
    });
    expect(byRule.get("etf_volatility_spike")?.evidence).toMatchObject({
      volatility20d: 0.4,
      volatility60d: 0.2,
    });
    expect(byRule.get("etf_drawdown_warning")?.evidence).toMatchObject({
      currentDrawdown: -0.15,
      maxDrawdown60d: -0.2,
    });
    expect(byRule.get("etf_amount_expansion")?.evidence).toMatchObject({
      amount: 25_000_000,
      averageAmount20d: 20_000_000,
      amountRatio20d: 0.6,
    });
    expect(byRule.get("etf_pe_low")?.evidence).toEqual({
      pePercentile: 0.1,
      lagDays: 1,
    });
    expect(byRule.get("etf_trend_improving")?.evidence).toEqual({
      previousScore: 3,
      currentScore: 6,
      scoreDelta: 3,
    });

    const descriptions = [...byRule.values()].map((draft) => draft.description).join("\n");
    expect(descriptions).toContain("50.00%");
    expect(descriptions).toContain("60.00%");
    expect(descriptions).toContain("8.00%");
    expect(descriptions).toContain("2500.00 万");
    expect(descriptions).not.toMatch(/建议买入|推荐配置|必然上涨/);
  });

  it("does not evaluate trend improvement without a previous snapshot score", async () => {
    const config = await loadRuleConfig();
    const context = await makeRuleContext(await makeEtfRuleFeatures(), null);
    const definition = ETF_RULES.find((rule) => rule.code === "etf_trend_improving");
    expect(definition).toBeDefined();

    expect(definition?.evaluate(context, ruleByCode(config, "etf_trend_improving"))).toEqual([]);

    const result = evaluateRules({
      analysisDate: context.analysisDate,
      snapshotVersion: context.snapshotVersion,
      features: context.features,
      rankings: context.rankings,
      market: context.market,
      ruleConfig: onlyRules(config, ["etf_trend_improving"]),
      previousTrendScores: null,
    });
    expect(result.notEvaluatedRules).toEqual(["etf_trend_improving"]);
    expect(result.etfs.items).toEqual([]);
  });
});

describe("rule engine limits and failure isolation", () => {
  it("sorts, deduplicates, and caps ETF findings at five per ETF", async () => {
    const config = await loadRuleConfig();
    const context = await makeRuleContext(await makeEtfRuleFeatures(), new Map([["A", 3]]));
    const result = evaluateRules({
      analysisDate: context.analysisDate,
      snapshotVersion: context.snapshotVersion,
      features: context.features,
      rankings: context.rankings,
      market: context.market,
      ruleConfig: config,
      previousTrendScores: context.previousTrendScores,
    });
    const etfA = result.etfs.items.filter((finding) => finding.etfCode === "A");

    expect(etfA).toHaveLength(5);
    expect(etfA.map((finding) => finding.ruleCode)).toEqual([
      "etf_drawdown_warning",
      "etf_ma20_overextended",
      "etf_volatility_spike",
      "etf_amount_expansion",
      "etf_bullish_alignment",
    ]);
    expect(etfA[0]).toMatchObject({
      id: "etf:A:etf_drawdown_warning:2026-11-13",
      ruleVersion: "1",
      level: "etf",
      severity: "warning",
      snapshotRef: { analysisDate: "2026-11-13", snapshotVersion: 1 },
    });
    expect(result.warnings).toContain("ETF_FINDINGS_TRUNCATED_PER_ETF:6");

    const second = evaluateRules({
      analysisDate: context.analysisDate,
      snapshotVersion: context.snapshotVersion,
      features: context.features,
      rankings: context.rankings,
      market: context.market,
      ruleConfig: config,
      previousTrendScores: context.previousTrendScores,
    });
    expect(second).toEqual(result);
  });

  it("isolates one failing rule while keeping other findings", async () => {
    const baseConfig = await loadRuleConfig();
    const config = onlyRules(baseConfig, ["etf_ma20_overextended", "etf_bullish_alignment"], {
      etf_ma20_overextended: { params: {} },
    });
    const context = await makeRuleContext(await makeEtfRuleFeatures());
    const result = evaluateRules({
      analysisDate: context.analysisDate,
      snapshotVersion: context.snapshotVersion,
      features: context.features,
      rankings: context.rankings,
      market: context.market,
      ruleConfig: config,
      previousTrendScores: null,
    });

    expect(
      result.warnings.some((warning) => warning.startsWith("RULE_FAILED:etf_ma20_overextended")),
    ).toBe(true);
    expect(result.etfs.items.map((finding) => finding.ruleCode)).toContain("etf_bullish_alignment");
  });

  it("fails when every enabled rule throws", async () => {
    const baseConfig = await loadRuleConfig();
    const config = onlyRules(baseConfig, ["etf_ma20_overextended"], {
      etf_ma20_overextended: { params: {} },
    });
    const context = await makeRuleContext(await makeEtfRuleFeatures());

    expect(() =>
      evaluateRules({
        analysisDate: context.analysisDate,
        snapshotVersion: context.snapshotVersion,
        features: context.features,
        rankings: context.rankings,
        market: context.market,
        ruleConfig: config,
        previousTrendScores: null,
      }),
    ).toThrow("All enabled rule evaluations failed");
  });
});
