import { stat } from "node:fs/promises";
import { etfFeatureFileSchema, type EtfFeatureFile } from "../domain/features.js";
import { findingsFileSchema, type FindingsFile } from "../domain/findings.js";
import {
  RANKING_CODES,
  rankingFileSchema,
  type RankingCode,
  type RankingFile,
} from "../domain/rankings.js";
import {
  marketActivitySchema,
  marketReturnsSchema,
  marketRiskSchema,
  marketStateSchema,
  marketTrendSchema,
  marketValuationSchema,
  type MarketActivity,
  type MarketReturns,
  type MarketRisk,
  type MarketState,
  type MarketTrend,
  type MarketValuation,
} from "../domain/market.js";
import {
  currentPointerSchema,
  marketOverviewSchema,
  snapshotManifestSchema,
  type CurrentPointer,
  type MarketOverview,
  type SnapshotManifest,
} from "../domain/snapshot.js";
import { sha256File } from "../storage/checksum.js";
import type { DataPaths } from "../storage/data-paths.js";
import { isDataError } from "../storage/errors.js";
import type { JsonStore } from "../storage/json-store.js";
import { latestPublishedManifest, listPublishedSnapshotManifests } from "./repository.js";
import { verifySnapshot } from "./snapshot-verifier.js";

export type SnapshotReadErrorCode = "SNAPSHOT_NOT_FOUND" | "SNAPSHOT_CORRUPT";

export class SnapshotReadError extends Error {
  constructor(
    readonly code: SnapshotReadErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SnapshotReadError";
  }
}

export interface SnapshotReference {
  analysisDate: string;
  snapshotVersion: number;
  relativePath: string;
  manifest: SnapshotManifest;
}

export interface SnapshotData extends SnapshotReference {
  overview: MarketOverview;
  market: {
    returns: MarketReturns;
    trend: MarketTrend;
    risk: MarketRisk;
    activity: MarketActivity;
    valuation: MarketValuation;
    state: MarketState;
  };
  features: Map<string, EtfFeatureFile>;
  rankings: Record<RankingCode, RankingFile>;
  findings: {
    market: FindingsFile;
    etfs: FindingsFile;
  };
}

export interface SnapshotSummary {
  analysisDate: string;
  snapshotVersion: number;
  publishedAt: string;
  dataStatus: SnapshotManifest["dataStatus"];
  parentVersion: number | null;
  inputFingerprint: string;
}

export interface ResolveSnapshotQuery {
  date?: string;
  version?: number;
}

export interface SnapshotReaderDependencies {
  maxCachedSnapshots?: number;
}

export class SnapshotReader {
  private readonly cache = new Map<string, SnapshotData>();
  private readonly maxCachedSnapshots: number;

  constructor(
    private readonly paths: DataPaths,
    private readonly store: JsonStore,
    dependencies: SnapshotReaderDependencies = {},
  ) {
    this.maxCachedSnapshots = dependencies.maxCachedSnapshots ?? 4;
  }

  async current(): Promise<CurrentPointer | null> {
    try {
      return await this.store.read(this.paths.currentPointerFile(), currentPointerSchema);
    } catch (error) {
      throw new SnapshotReadError("SNAPSHOT_CORRUPT", "Current snapshot pointer is invalid", {
        cause: errorMessage(error),
      });
    }
  }

  async resolve(query: ResolveSnapshotQuery = {}): Promise<SnapshotReference> {
    const current = await this.current();
    const analysisDate = query.date ?? current?.analysisDate ?? null;
    if (analysisDate === null) {
      throw new SnapshotReadError("SNAPSHOT_NOT_FOUND", "No published snapshot is available");
    }

    if (query.version !== undefined) {
      return this.resolveVersion(analysisDate, query.version);
    }

    if (query.date === undefined && current !== null && current.analysisDate === analysisDate) {
      const currentReference = await this.tryResolveVersion(analysisDate, current.snapshotVersion);
      if (currentReference !== null) {
        return currentReference;
      }
    }

    const manifests = (await listPublishedSnapshotManifests(this.paths, this.store)).filter(
      (item) => item.manifest.analysisDate === analysisDate,
    );
    const latest = manifests.at(-1);
    if (latest === undefined) {
      throw new SnapshotReadError(
        "SNAPSHOT_NOT_FOUND",
        `No published snapshot for ${analysisDate}`,
        { analysisDate },
      );
    }
    return {
      analysisDate,
      snapshotVersion: latest.manifest.snapshotVersion,
      relativePath: latest.directory.relativePath,
      manifest: latest.manifest,
    };
  }

  async load(query: ResolveSnapshotQuery = {}): Promise<SnapshotData> {
    const reference = await this.resolve(query);
    const cached = this.cache.get(reference.relativePath);
    if (cached !== undefined) {
      this.cache.delete(reference.relativePath);
      this.cache.set(reference.relativePath, cached);
      return cached;
    }

    const verification = await verifySnapshot(this.paths, this.store, reference.relativePath, {
      allowedStatuses: ["published"],
    });
    if (!verification.valid || verification.manifest === null) {
      throw new SnapshotReadError(
        "SNAPSHOT_CORRUPT",
        `Snapshot failed verification: ${reference.relativePath}`,
        { issues: verification.issues },
      );
    }
    const manifest = verification.manifest;
    const [
      overview,
      returns,
      trend,
      risk,
      activity,
      valuation,
      state,
      marketFindings,
      etfFindings,
    ] = await Promise.all([
      this.readFile(reference, "market/overview.json", marketOverviewSchema),
      this.readFile(reference, "market/returns.json", marketReturnsSchema),
      this.readFile(reference, "market/trend.json", marketTrendSchema),
      this.readFile(reference, "market/risk.json", marketRiskSchema),
      this.readFile(reference, "market/activity.json", marketActivitySchema),
      this.readFile(reference, "market/valuation.json", marketValuationSchema),
      this.readFile(reference, "market/state.json", marketStateSchema),
      this.readFile(reference, "findings/market.json", findingsFileSchema),
      this.readFile(reference, "findings/etfs.json", findingsFileSchema),
    ]);

    const featurePaths = manifest.files
      .map((file) => file.path)
      .filter((path) => path.startsWith("etfs/"))
      .sort();
    const rankingPaths = manifest.files
      .map((file) => file.path)
      .filter((path) => path.startsWith("rankings/"))
      .sort();
    const featureList = await Promise.all(
      featurePaths.map((path) => this.readFile(reference, path, etfFeatureFileSchema)),
    );
    const rankingList = await Promise.all(
      rankingPaths.map((path) => this.readFile(reference, path, rankingFileSchema)),
    );
    const features = new Map(featureList.map((feature) => [feature.code, feature]));
    const rankings = Object.fromEntries(
      rankingList.map((ranking) => [ranking.rankingCode, ranking]),
    ) as Record<RankingCode, RankingFile>;
    for (const code of RANKING_CODES) {
      if (rankings[code] === undefined) {
        throw new SnapshotReadError("SNAPSHOT_CORRUPT", `Snapshot is missing ranking ${code}`, {
          relativePath: reference.relativePath,
        });
      }
    }

    const data: SnapshotData = {
      ...reference,
      manifest,
      overview,
      market: { returns, trend, risk, activity, valuation, state },
      features,
      rankings,
      findings: { market: marketFindings, etfs: etfFindings },
    };
    this.cache.set(reference.relativePath, data);
    while (this.cache.size > this.maxCachedSnapshots) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.cache.delete(oldest);
    }
    return data;
  }

  async listSnapshots(): Promise<SnapshotSummary[]> {
    const manifests = await listPublishedSnapshotManifests(this.paths, this.store);
    return manifests
      .map(({ manifest }) => ({
        analysisDate: manifest.analysisDate,
        snapshotVersion: manifest.snapshotVersion,
        publishedAt: manifest.publishedAt ?? manifest.createdAt,
        dataStatus: manifest.dataStatus,
        parentVersion: manifest.parentVersion,
        inputFingerprint: manifest.inputFingerprint,
      }))
      .sort((left, right) =>
        left.analysisDate === right.analysisDate
          ? left.snapshotVersion - right.snapshotVersion
          : left.analysisDate.localeCompare(right.analysisDate),
      );
  }

  async listSince(analysisDate: string, cutoffDate: string): Promise<SnapshotReference[]> {
    const manifests = await listPublishedSnapshotManifests(this.paths, this.store);
    const byDate = new Map<string, SnapshotReference>();
    for (const { directory, manifest } of manifests) {
      if (manifest.analysisDate > analysisDate || manifest.analysisDate < cutoffDate) {
        continue;
      }
      byDate.set(manifest.analysisDate, {
        analysisDate: manifest.analysisDate,
        snapshotVersion: manifest.snapshotVersion,
        relativePath: directory.relativePath,
        manifest,
      });
    }
    return [...byDate.values()].sort((left, right) =>
      left.analysisDate.localeCompare(right.analysisDate),
    );
  }

  async loadFeatureAt(reference: SnapshotReference, code: string): Promise<EtfFeatureFile | null> {
    const path = `etfs/${code}.json`;
    const entry = reference.manifest.files.find((file) => file.path === path);
    if (entry === undefined) {
      return null;
    }
    await this.verifySnapshotFile(reference, path, entry.bytes, entry.checksum);
    return this.readFile(reference, path, etfFeatureFileSchema);
  }

  async latestBefore(date: string): Promise<SnapshotReference | null> {
    const latest = await latestPublishedManifest(this.paths, this.store, date);
    return latest === null
      ? null
      : {
          analysisDate: latest.manifest.analysisDate,
          snapshotVersion: latest.manifest.snapshotVersion,
          relativePath: latest.directory.relativePath,
          manifest: latest.manifest,
        };
  }

  private async resolveVersion(
    analysisDate: string,
    snapshotVersion: number,
  ): Promise<SnapshotReference> {
    const reference = await this.tryResolveVersion(analysisDate, snapshotVersion);
    if (reference === null) {
      throw new SnapshotReadError(
        "SNAPSHOT_NOT_FOUND",
        `Snapshot not found for ${analysisDate} v${snapshotVersion}`,
        { analysisDate, snapshotVersion },
      );
    }
    return reference;
  }

  private async tryResolveVersion(
    analysisDate: string,
    snapshotVersion: number,
  ): Promise<SnapshotReference | null> {
    const relativePath = this.paths.snapshotVersionPath(analysisDate, snapshotVersion);
    const exists = await this.store.exists(`${relativePath}/manifest.json`);
    if (!exists) {
      return null;
    }
    let manifest: SnapshotManifest;
    try {
      const parsed = await this.store.read(`${relativePath}/manifest.json`, snapshotManifestSchema);
      if (parsed === null) {
        return null;
      }
      manifest = parsed;
    } catch (error) {
      throw new SnapshotReadError("SNAPSHOT_CORRUPT", `Invalid manifest for ${relativePath}`, {
        cause: errorMessage(error),
      });
    }
    if (manifest.status !== "published") {
      return null;
    }
    return { analysisDate, snapshotVersion, relativePath, manifest };
  }

  private async verifySnapshotFile(
    reference: Pick<SnapshotReference, "relativePath">,
    path: string,
    expectedBytes: number,
    expectedChecksum: string,
  ): Promise<void> {
    try {
      const absolute = await this.paths.resolveSafe(`${reference.relativePath}/${path}`);
      const fileStat = await stat(absolute);
      if (fileStat.size !== expectedBytes) {
        throw new SnapshotReadError("SNAPSHOT_CORRUPT", `Snapshot file size mismatch: ${path}`, {
          path,
        });
      }
      const checksum = `sha256:${await sha256File(absolute)}`;
      if (checksum !== expectedChecksum) {
        throw new SnapshotReadError("SNAPSHOT_CORRUPT", `Snapshot checksum mismatch: ${path}`, {
          path,
        });
      }
    } catch (error) {
      if (error instanceof SnapshotReadError) {
        throw error;
      }
      throw new SnapshotReadError("SNAPSHOT_CORRUPT", `Snapshot file is unreadable: ${path}`, {
        path,
        cause: errorMessage(error),
      });
    }
  }

  private async readFile<T>(
    reference: Pick<SnapshotReference, "relativePath">,
    path: string,
    schema: import("zod").ZodType<T>,
  ): Promise<T> {
    try {
      const value = await this.store.read(`${reference.relativePath}/${path}`, schema);
      if (value === null) {
        throw new SnapshotReadError("SNAPSHOT_CORRUPT", `Snapshot file is missing: ${path}`, {
          path,
        });
      }
      return value;
    } catch (error) {
      if (error instanceof SnapshotReadError) {
        throw error;
      }
      throw new SnapshotReadError("SNAPSHOT_CORRUPT", `Snapshot file is invalid: ${path}`, {
        path,
        cause: errorMessage(error),
      });
    }
  }
}

function errorMessage(error: unknown): string {
  if (isDataError(error)) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
