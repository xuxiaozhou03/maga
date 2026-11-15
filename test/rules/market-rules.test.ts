import { describe, expect, it } from "vitest";
import type { EtfFeatureFile } from "../../src/domain/features.js";
import { MARKET_RULES } from "../../src/rules/market-rules.js";
import { makeFeature, makeValuation } from "../support/features.js";
import { loadRuleConfig, makeRuleContext, ruleByCode } from "../support/rules.js";

function broadFeatures(
  options: {
    positiveCount?: number;
    pePercentile?: number;
  } = {},
): EtfFeatureFile[] {
  const positiveCount = options.positiveCount ?? 20;
  return Array.from({ length: 20 }, (_, index) =>
    makeFeature({
      code: `ETF${String(index).padStart(2, "0")}`,
      returns: {
        "1d": index < positiveCount ? 0.02 : -0.01,
        "20d": (index + 1) / 100,
      },
      trend: { aboveMa20: true, maAlignment: "bullish" },
      risk: { volatility20d: 0.3, maxDrawdown60d: -0.2 },
      activity: { amount: 20_000_000, amountRatio20d: 0.3 },
      valuation: { pe: makeValuation(options.pePercentile ?? 0.2) },
    }),
  );
}

function riskConcentrationFeatures(): EtfFeatureFile[] {
  return [0.1, 0.2, 0.3, 0.4, 0.5].map((value, index) =>
    makeFeature({
      code: `RISK${index}`,
      risk: { volatility20d: value, maxDrawdown60d: -value },
    }),
  );
}

async function evaluateMarketRule(code: string, features: readonly EtfFeatureFile[]) {
  const config = await loadRuleConfig();
  const context = await makeRuleContext(features);
  const definition = MARKET_RULES.find((rule) => rule.code === code);
  expect(definition).toBeDefined();
  return definition?.evaluate(context, ruleByCode(config, code)) ?? [];
}

describe("market rule definitions", () => {
  it("evaluates the broad-market rules with evidence-backed descriptions", async () => {
    const expectedCodes = [
      "market_breadth_strong",
      "market_dispersion_high",
      "market_volatility_rising",
      "market_activity_improving",
      "market_trend_improving",
      "market_drawdown_pressure",
      "market_valuation_low",
    ];
    const drafts = [];
    for (const code of expectedCodes) {
      const result = await evaluateMarketRule(code, broadFeatures());
      expect(result).toHaveLength(1);
      drafts.push(result[0]);
    }

    expect(drafts.map((draft) => draft?.ruleCode)).toEqual(expectedCodes);
    expect(drafts[0]?.evidence).toMatchObject({
      positiveRatio1d: 1,
      upCount: 20,
      validCount: 20,
    });
    expect(drafts[1]?.evidence.spread as number).toBeGreaterThan(0.1);
    expect(drafts[2]?.evidence).toMatchObject({ meanVolatility20d: 0.3 });
    expect(drafts[3]?.evidence).toMatchObject({
      meanAmountRatio20d: 0.3,
      positiveRatio1d: 1,
    });
    expect(drafts[4]?.evidence).toMatchObject({
      aboveMa20Ratio: 1,
      bullishRatio: 1,
    });
    expect(drafts[5]?.evidence).toMatchObject({
      meanMaxDrawdown60d: -0.2,
      highDrawdownRatio: 1,
    });
    expect(drafts[6]?.evidence).toEqual({
      peMedianPercentile: 0.2,
      peValidCount: 20,
    });

    const descriptions = drafts.map((draft) => draft?.description).join("\n");
    expect(descriptions).toContain("100.00%");
    expect(descriptions).toContain("20.00%");
    expect(descriptions).not.toMatch(/建议买入|推荐配置|必然上涨/);
  });

  it("evaluates market breadth weak independently", async () => {
    const result = await evaluateMarketRule(
      "market_breadth_weak",
      broadFeatures({ positiveCount: 4 }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.evidence).toMatchObject({
      positiveRatio1d: 0.2,
      downCount: 16,
      validCount: 20,
    });
  });

  it("evaluates high market valuation independently", async () => {
    const result = await evaluateMarketRule(
      "market_valuation_high",
      broadFeatures({ pePercentile: 0.9 }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.evidence).toEqual({
      peMedianPercentile: 0.9,
      peValidCount: 20,
    });
  });

  it("evaluates risk concentration with its own high-risk ratio", async () => {
    const result = await evaluateMarketRule(
      "market_risk_concentration",
      riskConcentrationFeatures(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.evidence).toMatchObject({
      highRiskRatio: 0.4,
      highRiskCount: 2,
      validCount: 5,
    });
  });

  it("does not trigger opposing rules on the broad-market fixture", async () => {
    expect(await evaluateMarketRule("market_breadth_weak", broadFeatures())).toEqual([]);
    expect(await evaluateMarketRule("market_valuation_high", broadFeatures())).toEqual([]);
  });
});
