import type { EtfFeatureFile } from "../domain/features.js";
import type { SnapshotReader, SnapshotReference } from "../snapshots/snapshot-reader.js";

export const HISTORY_RANGES = ["1m", "3m", "6m", "1y", "2y"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

export interface EtfHistoryItem {
  analysisDate: string;
  snapshotVersion: number;
  dataQuality: EtfFeatureFile["dataQuality"];
  returns: EtfFeatureFile["features"]["returns"];
  trend: {
    close: number | null;
    ma20Deviation: number | null;
    maAlignment: EtfFeatureFile["features"]["trend"]["maAlignment"];
  };
  risk: {
    volatility20d: number | null;
    currentDrawdown: number | null;
  };
  activity: {
    averageAmount20d: number | null;
    amountRatio20d: number | null;
  };
  valuation: {
    pePercentile: number | null;
    pbPercentile: number | null;
    psPercentile: number | null;
  };
}

export interface EtfHistoryResult {
  code: string;
  range: HistoryRange;
  startDate: string;
  endDate: string;
  total: number;
  items: EtfHistoryItem[];
}

export async function queryEtfHistory(input: {
  reader: SnapshotReader;
  reference: SnapshotReference;
  code: string;
  range: HistoryRange;
}): Promise<EtfHistoryResult> {
  const startDate = cutoffDate(input.reference.analysisDate, input.range);
  const references = await input.reader.listSince(input.reference.analysisDate, startDate);
  const items: EtfHistoryItem[] = [];
  for (const reference of references) {
    const feature = await input.reader.loadFeatureAt(reference, input.code);
    if (feature === null) {
      continue;
    }
    items.push({
      analysisDate: reference.analysisDate,
      snapshotVersion: reference.snapshotVersion,
      dataQuality: feature.dataQuality,
      returns: feature.features.returns,
      trend: {
        close: feature.features.trend.close,
        ma20Deviation: feature.features.trend.ma20Deviation,
        maAlignment: feature.features.trend.maAlignment,
      },
      risk: {
        volatility20d: feature.features.risk.volatility20d,
        currentDrawdown: feature.features.risk.currentDrawdown,
      },
      activity: {
        averageAmount20d: feature.features.activity.averageAmount20d,
        amountRatio20d: feature.features.activity.amountRatio20d,
      },
      valuation: {
        pePercentile: feature.features.valuation.pe?.historicalPercentile ?? null,
        pbPercentile: feature.features.valuation.pb?.historicalPercentile ?? null,
        psPercentile: feature.features.valuation.ps?.historicalPercentile ?? null,
      },
    });
  }
  return {
    code: input.code,
    range: input.range,
    startDate,
    endDate: input.reference.analysisDate,
    total: items.length,
    items,
  };
}

export function cutoffDate(analysisDate: string, range: HistoryRange): string {
  const value = new Date(`${analysisDate}T00:00:00.000Z`);
  const months =
    range === "1m" ? 1 : range === "3m" ? 3 : range === "6m" ? 6 : range === "1y" ? 12 : 24;
  value.setUTCMonth(value.getUTCMonth() - months);
  return value.toISOString().slice(0, 10);
}
