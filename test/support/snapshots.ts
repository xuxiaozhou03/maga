import type { CalculationConfig } from "../../src/config/schemas.js";
import type { EtfFeatureFile } from "../../src/domain/features.js";
import type { FindingsFile } from "../../src/domain/findings.js";
import type { RankingFile } from "../../src/domain/rankings.js";
import type { InputDigest } from "../../src/domain/snapshot.js";
import { calculateMarketAnalysis } from "../../src/market/market-analysis.js";
import { calculateEtfRankings } from "../../src/rankings/etf-rankings.js";
import { buildInputDigest } from "../../src/snapshots/input-digest.js";
import type { SnapshotPayload } from "../../src/snapshots/payload.js";
import { checksumJson } from "../../src/storage/checksum.js";
import type { Kline } from "../../src/sources/types.js";
import { makeEtfLink, makeFeature, makeValuation } from "./features.js";

export const SNAPSHOT_ANALYSIS_DATE = "2026-11-13";
export const SNAPSHOT_CODES = [
  "510300.SH",
  "510500.SH",
  "159915.SZ",
  "512100.SH",
  "588000.SH",
] as const;

export interface SnapshotFixture {
  features: EtfFeatureFile[];
  digest: InputDigest;
  makePayload(snapshotVersion: number): SnapshotPayload;
}

export function makeSnapshotFixture(config: CalculationConfig): SnapshotFixture {
  const features = SNAPSHOT_CODES.map((code, index) =>
    makeFeature({
      code,
      returns: {
        "1d": (index + 1) / 100,
        "5d": (index + 2) / 100,
        "20d": (index + 3) / 100,
        "60d": (index + 4) / 100,
      },
      trend: {
        maAlignment: index % 2 === 0 ? "bullish" : "bearish",
        maAlignmentScore: index + 1,
        aboveMa20: index % 2 === 0,
        aboveMa60: index < 3,
      },
      risk: {
        volatility20d: 0.1 + index / 100,
        maxDrawdown60d: -(0.05 + index / 100),
        currentDrawdown: -(0.02 + index / 100),
        maxDrawdown60dPeakDate: "2026-11-01",
        maxDrawdown60dTroughDate: "2026-11-10",
      },
      activity: {
        amount: 1_000_000 * (index + 1),
        averageAmount20d: 900_000 * (index + 1),
        amountRatio20d: index / 10,
        amountSampleCount20d: 20,
      },
      valuation: {
        pe: makeValuation((index + 1) / 10),
        pb: makeValuation((index + 2) / 10),
        ps: makeValuation((index + 3) / 10),
      },
    }),
  );

  const etfs = features.map((feature) => makeEtfLink(feature.code, `IDX${feature.code}`));
  const market = calculateMarketAnalysis({
    features,
    etfs,
    analysisDate: SNAPSHOT_ANALYSIS_DATE,
    config,
  });
  const klinesByCode = new Map<string, Kline[]>(
    features.map((feature, index) => [
      feature.code,
      [
        {
          code: feature.code,
          date: SNAPSHOT_ANALYSIS_DATE,
          open: 1 + index / 10,
          high: 1.1 + index / 10,
          low: 0.9 + index / 10,
          close: 1 + index / 10,
          volume: 1000 + index,
          amount: 1_000_000 * (index + 1),
          change: 0.01,
          changePercent: 0.01,
        },
      ],
    ]),
  );
  const configHash = checksumJson({ source: "fixture", calculation: config });
  const ruleConfigHash = checksumJson({ ruleVersion: "1" });
  const categoryMappingHash = checksumJson({ mappingVersion: 1 });
  const poolHash = checksumJson(features.map((feature) => feature.code));
  const digest = buildInputDigest({
    analysisDate: SNAPSHOT_ANALYSIS_DATE,
    algorithmVersion: config.algorithmVersion,
    configHash,
    ruleConfigHash,
    categoryMappingHash,
    poolHash,
    klinesByCode,
    valuationsByCode: new Map(),
  });

  return {
    features,
    digest,
    makePayload(snapshotVersion: number): SnapshotPayload {
      const rankings = calculateEtfRankings({
        features,
        analysisDate: SNAPSHOT_ANALYSIS_DATE,
        snapshotVersion,
        config,
      });
      return {
        analysisDate: SNAPSHOT_ANALYSIS_DATE,
        inputDigest: digest,
        algorithmVersion: config.algorithmVersion,
        configVersion: 1,
        configHash,
        ruleVersion: "1",
        ruleConfigHash,
        categoryMappingVersion: 1,
        categoryMappingHash,
        poolVersion: 1,
        poolHash,
        sourceAsOf: {
          etfListFetchedAt: "2026-11-15T08:00:00.000Z",
          klineLastDate: SNAPSHOT_ANALYSIS_DATE,
          valuationLastDate: SNAPSHOT_ANALYSIS_DATE,
        },
        features,
        rankings,
        market,
        findings: {
          market: makeFindings("market", snapshotVersion),
          etfs: makeFindings("etf", snapshotVersion),
        },
      };
    },
  };
}

export function makeFindings(level: "market" | "etf", snapshotVersion: number): FindingsFile {
  return {
    schemaVersion: 1,
    analysisDate: SNAPSHOT_ANALYSIS_DATE,
    snapshotVersion,
    level,
    ruleVersion: "1",
    items: [],
  };
}

export function rankingSnapshotVersions(rankings: Record<string, RankingFile>): number[] {
  return Object.values(rankings).map((ranking) => ranking.snapshotVersion);
}
