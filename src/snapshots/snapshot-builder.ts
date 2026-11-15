import { stat } from "node:fs/promises";
import { etfFeatureFileSchema } from "../domain/features.js";
import { findingsFileSchema } from "../domain/findings.js";
import { RANKING_CODES, rankingFileSchema } from "../domain/rankings.js";
import {
  marketActivitySchema,
  marketReturnsSchema,
  marketRiskSchema,
  marketStateSchema,
  marketTrendSchema,
  marketValuationSchema,
} from "../domain/market.js";
import {
  snapshotManifestSchema,
  marketOverviewSchema,
  type SnapshotDataStatus,
  type SnapshotFileEntry,
  type SnapshotManifest,
  type SnapshotReason,
} from "../domain/snapshot.js";
import { normalizeWarnings } from "../domain/warnings.js";
import type { WarningItem } from "../domain/warnings.js";
import type { DataPaths } from "../storage/data-paths.js";
import { sha256File } from "../storage/checksum.js";
import { JsonStore } from "../storage/json-store.js";
import { fingerprintOfInputDigest } from "./input-digest.js";
import { buildMarketOverview, type SnapshotPayload } from "./payload.js";

export interface BuildSnapshotOptions {
  snapshotVersion: number;
  taskId: string;
  createdAt: string;
  reason: SnapshotReason;
  parentVersion: number | null;
  dataStatus: SnapshotDataStatus;
  extraWarnings?: readonly (string | WarningItem)[];
}

export interface BuiltSnapshot {
  relativePath: string;
  manifest: SnapshotManifest;
}

interface PendingFile {
  path: string;
  value: unknown;
  schema: Parameters<JsonStore["writeAtomic"]>[2];
}

export async function buildSnapshot(
  paths: DataPaths,
  store: JsonStore,
  payload: SnapshotPayload,
  options: BuildSnapshotOptions,
): Promise<BuiltSnapshot> {
  validatePayload(payload, options.snapshotVersion);
  const relativePath = paths.tempSnapshotPath(
    payload.analysisDate,
    options.snapshotVersion,
    options.taskId,
  );
  const featureSet = new Set(payload.features.map((feature) => feature.code));
  const warnings = normalizeWarnings([
    ...(payload.warnings ?? []),
    ...(options.extraWarnings ?? []),
  ]);
  const totalFeatures = payload.features.length;
  const validFeatures = payload.features.filter(
    (feature) => feature.dataQuality.sampleValid,
  ).length;

  const files: PendingFile[] = [];
  for (const feature of [...payload.features].sort((left, right) =>
    left.code.localeCompare(right.code),
  )) {
    files.push({
      path: `etfs/${feature.code}.json`,
      value: feature,
      schema: etfFeatureFileSchema,
    });
  }
  for (const rankingCode of RANKING_CODES) {
    files.push({
      path: `rankings/${rankingCode}.json`,
      value: payload.rankings[rankingCode],
      schema: rankingFileSchema,
    });
  }

  const overview = buildMarketOverview(payload.market, payload.findings);
  files.push(
    { path: "market/overview.json", value: overview, schema: marketOverviewSchema },
    { path: "market/returns.json", value: payload.market.returns, schema: marketReturnsSchema },
    { path: "market/trend.json", value: payload.market.trend, schema: marketTrendSchema },
    { path: "market/risk.json", value: payload.market.risk, schema: marketRiskSchema },
    {
      path: "market/activity.json",
      value: payload.market.activity,
      schema: marketActivitySchema,
    },
    {
      path: "market/valuation.json",
      value: payload.market.valuation,
      schema: marketValuationSchema,
    },
    { path: "market/state.json", value: payload.market.state, schema: marketStateSchema },
    {
      path: "findings/market.json",
      value: payload.findings.market,
      schema: findingsFileSchema,
    },
    { path: "findings/etfs.json", value: payload.findings.etfs, schema: findingsFileSchema },
  );

  const written: SnapshotFileEntry[] = [];
  for (const file of files) {
    const target = `${relativePath}/${file.path}`;
    await store.writeAtomic(target, file.value, file.schema, { overwrite: false });
    const absolute = await paths.resolveSafe(target);
    const fileStat = await stat(absolute);
    written.push({
      path: file.path,
      checksum: `sha256:${await sha256File(absolute)}`,
      bytes: fileStat.size,
    });
  }

  const manifest = snapshotManifestSchema.parse({
    schemaVersion: 1,
    analysisDate: payload.analysisDate,
    snapshotVersion: options.snapshotVersion,
    status: "validated",
    dataStatus: options.dataStatus,
    createdAt: options.createdAt,
    publishedAt: null,
    algorithmVersion: payload.algorithmVersion,
    configVersion: payload.configVersion,
    configHash: payload.configHash,
    ruleVersion: payload.ruleVersion,
    ruleConfigHash: payload.ruleConfigHash,
    categoryMappingVersion: payload.categoryMappingVersion,
    categoryMappingHash: payload.categoryMappingHash,
    poolVersion: payload.poolVersion,
    poolHash: payload.poolHash,
    etfCount: totalFeatures,
    klineValidCount: validFeatures,
    valuationValidIndexCount: payload.market.samples.valuationValidIndexCount,
    valuationValidEtfCount: payload.market.samples.valuationValidEtfCount,
    sourceAsOf: payload.sourceAsOf,
    inputFingerprint: fingerprintOfInputDigest(payload.inputDigest),
    parentVersion: options.parentVersion,
    reason: options.reason,
    counts: {
      etfs: totalFeatures,
      rankings: RANKING_CODES.length,
      market: 7,
      findings: 2,
    },
    files: written.sort((left, right) => left.path.localeCompare(right.path)),
    warnings,
  });

  await store.writeAtomic(`${relativePath}/manifest.json`, manifest, snapshotManifestSchema, {
    overwrite: false,
  });

  assertRankingPoolCoverage(payload.rankings, featureSet);
  return { relativePath, manifest };
}

function validatePayload(payload: SnapshotPayload, snapshotVersion: number): void {
  if (!Number.isInteger(snapshotVersion) || snapshotVersion <= 0) {
    throw new Error(`Invalid snapshot version: ${snapshotVersion}`);
  }
  if (payload.inputDigest.analysisDate !== payload.analysisDate) {
    throw new Error("Input digest analysisDate does not match snapshot payload");
  }
  if (payload.inputDigest.algorithmVersion !== payload.algorithmVersion) {
    throw new Error("Input digest algorithmVersion does not match snapshot payload");
  }
  if (payload.inputDigest.configHash !== payload.configHash) {
    throw new Error("Input digest configHash does not match snapshot payload");
  }
  if (payload.inputDigest.ruleConfigHash !== payload.ruleConfigHash) {
    throw new Error("Input digest ruleConfigHash does not match snapshot payload");
  }
  if (payload.inputDigest.categoryMappingHash !== payload.categoryMappingHash) {
    throw new Error("Input digest categoryMappingHash does not match snapshot payload");
  }
  if (payload.inputDigest.poolHash !== payload.poolHash) {
    throw new Error("Input digest poolHash does not match snapshot payload");
  }

  const codes = new Set<string>();
  for (const feature of payload.features) {
    if (feature.analysisDate !== payload.analysisDate) {
      throw new Error(`Feature ${feature.code} analysisDate does not match snapshot date`);
    }
    if (feature.latestKlineDate !== null && feature.latestKlineDate > payload.analysisDate) {
      throw new Error(`Feature ${feature.code} contains future Kline data`);
    }
    if (codes.has(feature.code)) {
      throw new Error(`Duplicate ETF feature: ${feature.code}`);
    }
    codes.add(feature.code);
    for (const valuation of [
      feature.features.valuation.pe,
      feature.features.valuation.pb,
      feature.features.valuation.ps,
    ]) {
      if (valuation !== null && valuation.date > payload.analysisDate) {
        throw new Error(`Feature ${feature.code} contains future valuation data`);
      }
    }
  }
  const digestCodes = payload.inputDigest.etfs.map((item) => item.code).sort();
  const featureCodes = [...codes].sort();
  if (
    digestCodes.length !== featureCodes.length ||
    !digestCodes.every((code, index) => code === featureCodes[index])
  ) {
    throw new Error("Input digest ETF codes do not match snapshot features");
  }

  for (const rankingCode of RANKING_CODES) {
    const ranking = payload.rankings[rankingCode];
    if (ranking === undefined) {
      throw new Error(`Missing ranking: ${rankingCode}`);
    }
    if (ranking.rankingCode !== rankingCode) {
      throw new Error(
        `Ranking key mismatch: expected ${rankingCode}, found ${ranking.rankingCode}`,
      );
    }
    if (ranking.analysisDate !== payload.analysisDate) {
      throw new Error(`Ranking ${rankingCode} analysisDate does not match snapshot date`);
    }
    if (ranking.snapshotVersion !== snapshotVersion) {
      throw new Error(`Ranking ${rankingCode} snapshotVersion does not match target version`);
    }
  }

  assertMarketDate(payload.market.returns.analysisDate, payload.analysisDate, "returns");
  assertMarketDate(payload.market.trend.analysisDate, payload.analysisDate, "trend");
  assertMarketDate(payload.market.risk.analysisDate, payload.analysisDate, "risk");
  assertMarketDate(payload.market.activity.analysisDate, payload.analysisDate, "activity");
  assertMarketDate(payload.market.valuation.analysisDate, payload.analysisDate, "valuation");
  assertMarketDate(payload.market.state.analysisDate, payload.analysisDate, "state");
  if (payload.market.samples.poolCount !== payload.features.length) {
    throw new Error("Market sample poolCount does not match feature count");
  }

  assertFindings(payload.findings.market, "market", payload.analysisDate, snapshotVersion);
  assertFindings(payload.findings.etfs, "etf", payload.analysisDate, snapshotVersion);
  for (const finding of payload.findings.etfs.items) {
    if (finding.etfCode === undefined || !codes.has(finding.etfCode)) {
      throw new Error(`ETF finding references unknown code: ${String(finding.etfCode)}`);
    }
  }
}

function assertMarketDate(value: string, analysisDate: string, label: string): void {
  if (value !== analysisDate) {
    throw new Error(`Market ${label} analysisDate does not match snapshot date`);
  }
}

function assertFindings(
  file: SnapshotPayload["findings"]["market"],
  level: "market" | "etf",
  analysisDate: string,
  snapshotVersion: number,
): void {
  if (file.level !== level) {
    throw new Error(`Findings file level mismatch: expected ${level}`);
  }
  if (file.analysisDate !== analysisDate || file.snapshotVersion !== snapshotVersion) {
    throw new Error(`Findings file ${level} does not match target snapshot`);
  }
}

function assertRankingPoolCoverage(
  rankings: SnapshotPayload["rankings"],
  featureCodes: ReadonlySet<string>,
): void {
  for (const rankingCode of RANKING_CODES) {
    const ranking = rankings[rankingCode];
    const seen = new Set<string>();
    for (const item of ranking.items) {
      if (!featureCodes.has(item.code)) {
        throw new Error(`Ranking ${rankingCode} references ETF outside the pool: ${item.code}`);
      }
      if (seen.has(item.code)) {
        throw new Error(`Ranking ${rankingCode} contains duplicate ETF: ${item.code}`);
      }
      seen.add(item.code);
    }
  }
}
