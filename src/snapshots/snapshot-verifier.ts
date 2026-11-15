import { readdir, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import type { z } from "zod";
import { etfFeatureFileSchema, type EtfFeatureFile } from "../domain/features.js";
import { findingsFileSchema } from "../domain/findings.js";
import { RANKING_CODES, rankingFileSchema, type RankingFile } from "../domain/rankings.js";
import {
  marketActivitySchema,
  marketReturnsSchema,
  marketRiskSchema,
  marketStateSchema,
  marketTrendSchema,
  marketValuationSchema,
} from "../domain/market.js";
import {
  marketOverviewSchema,
  snapshotManifestSchema,
  type SnapshotManifest,
  type SnapshotStatus,
} from "../domain/snapshot.js";
import type { DataPaths } from "../storage/data-paths.js";
import { sha256File } from "../storage/checksum.js";
import { isDataError } from "../storage/errors.js";
import { JsonStore } from "../storage/json-store.js";
import { SNAPSHOT_MARKET_FILES } from "./payload.js";

export interface VerifySnapshotOptions {
  allowedStatuses?: readonly SnapshotStatus[];
}

export interface SnapshotVerificationResult {
  valid: boolean;
  relativePath: string;
  manifest: SnapshotManifest | null;
  issues: string[];
}

type SnapshotFileValue =
  | EtfFeatureFile
  | RankingFile
  | ReturnType<typeof marketOverviewSchema.parse>
  | ReturnType<typeof marketReturnsSchema.parse>
  | ReturnType<typeof marketTrendSchema.parse>
  | ReturnType<typeof marketRiskSchema.parse>
  | ReturnType<typeof marketActivitySchema.parse>
  | ReturnType<typeof marketValuationSchema.parse>
  | ReturnType<typeof marketStateSchema.parse>
  | ReturnType<typeof findingsFileSchema.parse>;

export async function verifySnapshot(
  paths: DataPaths,
  store: JsonStore,
  relativePath: string,
  options: VerifySnapshotOptions = {},
): Promise<SnapshotVerificationResult> {
  const issues: string[] = [];
  let manifest: SnapshotManifest | null = null;
  try {
    manifest = await store.read(`${relativePath}/manifest.json`, snapshotManifestSchema);
  } catch (error) {
    issues.push(`MANIFEST_INVALID: ${errorMessage(error)}`);
  }

  if (manifest === null) {
    return { valid: false, relativePath, manifest: null, issues };
  }

  const allowedStatuses = options.allowedStatuses ?? ["published"];
  if (!allowedStatuses.includes(manifest.status)) {
    issues.push(`STATUS_NOT_ALLOWED: ${manifest.status}`);
  }

  const root = await paths.resolveSafe(relativePath);
  let actualFiles: string[];
  try {
    actualFiles = (await collectFiles(root))
      .map((path) => path.split(sep).join("/"))
      .filter((path) => path !== "manifest.json")
      .sort();
  } catch (error) {
    issues.push(`SNAPSHOT_UNREADABLE: ${errorMessage(error)}`);
    return { valid: false, relativePath, manifest, issues };
  }

  const listedFiles = [...manifest.files].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const actualSet = new Set(actualFiles);
  const listedSet = new Set(listedFiles.map((file) => file.path));
  for (const path of actualFiles) {
    if (!listedSet.has(path)) {
      issues.push(`UNLISTED_FILE: ${path}`);
    }
  }
  for (const path of listedSet) {
    if (!actualSet.has(path)) {
      issues.push(`MISSING_FILE: ${path}`);
    }
  }

  const parsed = new Map<string, SnapshotFileValue>();
  for (const entry of listedFiles) {
    const absolute = join(root, ...entry.path.split("/"));
    try {
      const fileStat = await stat(absolute);
      if (fileStat.size !== entry.bytes) {
        issues.push(
          `BYTES_MISMATCH: ${entry.path} expected=${entry.bytes} actual=${fileStat.size}`,
        );
      }
      const checksum = `sha256:${await sha256File(absolute)}`;
      if (checksum !== entry.checksum) {
        issues.push(`CHECKSUM_MISMATCH: ${entry.path}`);
      }
    } catch (error) {
      issues.push(`FILE_UNREADABLE: ${entry.path}: ${errorMessage(error)}`);
      continue;
    }

    const schema = schemaForPath(entry.path);
    if (schema === null) {
      issues.push(`UNKNOWN_FILE: ${entry.path}`);
      continue;
    }
    try {
      const value = await store.read(`${relativePath}/${entry.path}`, schema);
      if (value === null) {
        issues.push(`MISSING_FILE: ${entry.path}`);
        continue;
      }
      parsed.set(entry.path, value as SnapshotFileValue);
    } catch (error) {
      issues.push(`SCHEMA_INVALID: ${entry.path}: ${errorMessage(error)}`);
    }
  }

  validateManifestFiles(manifest, issues);
  validateParsedSnapshot(manifest, parsed, issues);
  return { valid: issues.length === 0, relativePath, manifest, issues };
}

function schemaForPath(path: string): z.ZodType<unknown> | null {
  if (/^etfs\/[^/]+\.json$/.test(path)) {
    return etfFeatureFileSchema;
  }
  if (/^rankings\/[^/]+\.json$/.test(path)) {
    return rankingFileSchema;
  }
  if (path === "market/overview.json") {
    return marketOverviewSchema;
  }
  if (path === "market/returns.json") {
    return marketReturnsSchema;
  }
  if (path === "market/trend.json") {
    return marketTrendSchema;
  }
  if (path === "market/risk.json") {
    return marketRiskSchema;
  }
  if (path === "market/activity.json") {
    return marketActivitySchema;
  }
  if (path === "market/valuation.json") {
    return marketValuationSchema;
  }
  if (path === "market/state.json") {
    return marketStateSchema;
  }
  if (path === "findings/market.json" || path === "findings/etfs.json") {
    return findingsFileSchema;
  }
  return null;
}

function validateManifestFiles(manifest: SnapshotManifest, issues: string[]): void {
  const actualRankings = manifest.files
    .filter((file) => file.path.startsWith("rankings/"))
    .map((file) => file.path.slice("rankings/".length, -".json".length))
    .sort();
  if (!arraysEqual(actualRankings, [...RANKING_CODES].sort())) {
    issues.push(
      `RANKINGS_INCOMPLETE: expected=${RANKING_CODES.length} actual=${actualRankings.length}`,
    );
  }

  const actualMarket = manifest.files
    .filter((file) => file.path.startsWith("market/"))
    .map((file) => file.path.slice("market/".length, -".json".length))
    .sort();
  if (!arraysEqual(actualMarket, [...SNAPSHOT_MARKET_FILES].sort())) {
    issues.push(`MARKET_FILES_INCOMPLETE: expected=${SNAPSHOT_MARKET_FILES.length}`);
  }

  const findings = manifest.files
    .filter((file) => file.path.startsWith("findings/"))
    .map((file) => file.path)
    .sort();
  if (!arraysEqual(findings, ["findings/etfs.json", "findings/market.json"])) {
    issues.push("FINDINGS_FILES_INCOMPLETE");
  }

  if (manifest.counts.etfs !== manifest.etfCount) {
    issues.push("COUNT_MISMATCH: etfs");
  }
  if (manifest.counts.rankings !== actualRankings.length) {
    issues.push("COUNT_MISMATCH: rankings");
  }
  if (manifest.counts.market !== actualMarket.length) {
    issues.push("COUNT_MISMATCH: market");
  }
  if (manifest.counts.findings !== findings.length) {
    issues.push("COUNT_MISMATCH: findings");
  }
}

function validateParsedSnapshot(
  manifest: SnapshotManifest,
  parsed: ReadonlyMap<string, SnapshotFileValue>,
  issues: string[],
): void {
  const etfs = new Map<string, EtfFeatureFile>();
  for (const [path, value] of parsed) {
    if (!path.startsWith("etfs/")) {
      continue;
    }
    const feature = value as EtfFeatureFile;
    const filenameCode = path.slice("etfs/".length, -".json".length);
    if (feature.code !== filenameCode) {
      issues.push(`ETF_CODE_MISMATCH: ${path}`);
    }
    if (etfs.has(feature.code)) {
      issues.push(`DUPLICATE_ETF: ${feature.code}`);
    }
    etfs.set(feature.code, feature);
    if (feature.analysisDate !== manifest.analysisDate) {
      issues.push(`ETF_DATE_MISMATCH: ${feature.code}`);
    }
    if (feature.latestKlineDate !== null && feature.latestKlineDate > manifest.analysisDate) {
      issues.push(`FUTURE_KLINE_DATA: ${feature.code}`);
    }
    for (const valuation of [
      feature.features.valuation.pe,
      feature.features.valuation.pb,
      feature.features.valuation.ps,
    ]) {
      if (valuation !== null && valuation.date > manifest.analysisDate) {
        issues.push(`FUTURE_VALUATION_DATA: ${feature.code}`);
      }
    }
  }

  if (etfs.size !== manifest.etfCount) {
    issues.push(`ETF_COUNT_MISMATCH: manifest=${manifest.etfCount} files=${etfs.size}`);
  }
  const validCount = [...etfs.values()].filter((feature) => feature.dataQuality.sampleValid).length;
  if (validCount !== manifest.klineValidCount) {
    issues.push(
      `KLINE_VALID_COUNT_MISMATCH: manifest=${manifest.klineValidCount} files=${validCount}`,
    );
  }

  for (const [path, value] of parsed) {
    if (!path.startsWith("rankings/")) {
      continue;
    }
    const ranking = value as RankingFile;
    const filenameCode = path.slice("rankings/".length, -".json".length);
    if (ranking.rankingCode !== filenameCode) {
      issues.push(`RANKING_CODE_MISMATCH: ${path}`);
    }
    if (ranking.analysisDate !== manifest.analysisDate) {
      issues.push(`RANKING_DATE_MISMATCH: ${path}`);
    }
    if (ranking.snapshotVersion !== manifest.snapshotVersion) {
      issues.push(`RANKING_VERSION_MISMATCH: ${path}`);
    }
    for (const item of ranking.items) {
      if (!etfs.has(item.code)) {
        issues.push(`RANKING_UNKNOWN_ETF: ${path}:${item.code}`);
      }
    }
  }

  const overview = parsed.get("market/overview.json");
  if (overview !== undefined) {
    const marketOverview = overview as ReturnType<typeof marketOverviewSchema.parse>;
    if (marketOverview.analysisDate !== manifest.analysisDate) {
      issues.push("MARKET_OVERVIEW_DATE_MISMATCH");
    }
    if (marketOverview.valuation.valuationValidIndexCount !== manifest.valuationValidIndexCount) {
      issues.push("VALUATION_INDEX_COUNT_MISMATCH");
    }
    if (marketOverview.valuation.valuationValidEtfCount !== manifest.valuationValidEtfCount) {
      issues.push("VALUATION_ETF_COUNT_MISMATCH");
    }
  }

  for (const path of [
    "market/returns.json",
    "market/trend.json",
    "market/risk.json",
    "market/activity.json",
    "market/valuation.json",
    "market/state.json",
  ]) {
    const value = parsed.get(path) as { analysisDate?: string } | undefined;
    if (value !== undefined && value.analysisDate !== manifest.analysisDate) {
      issues.push(`MARKET_DATE_MISMATCH: ${path}`);
    }
  }

  for (const path of ["findings/market.json", "findings/etfs.json"]) {
    const findingFile = parsed.get(path);
    if (findingFile === undefined) {
      continue;
    }
    const file = findingFile as ReturnType<typeof findingsFileSchema.parse>;
    if (
      file.analysisDate !== manifest.analysisDate ||
      file.snapshotVersion !== manifest.snapshotVersion
    ) {
      issues.push(`FINDINGS_VERSION_MISMATCH: ${path}`);
    }
    if (path === "findings/etfs.json") {
      for (const finding of file.items) {
        if (finding.etfCode === undefined || !etfs.has(finding.etfCode)) {
          issues.push(`FINDINGS_UNKNOWN_ETF: ${String(finding.etfCode)}`);
        }
      }
    }
  }
}

async function collectFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in snapshots: ${child}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, child)));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function errorMessage(error: unknown): string {
  if (isDataError(error)) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
