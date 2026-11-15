import type { RawEtf } from "../sources/contracts.js";
import type { Etf, RejectedEtf, SelectionReason, SelectionReport } from "../domain/etf.js";
import { normalizeRawEtf } from "./etf-normalizer.js";

export interface EtfPoolSelection {
  items: Etf[];
  sourceTotal: number;
  reasons: SelectionReport["reasons"];
  afterBasicFilter: number;
  duplicateGroups: number;
  maxGroupSize: number;
  rejected: RejectedEtf[];
}

export interface SelectEtfPoolOptions {
  premiumRateScale?: "percent" | "fraction";
}

export function selectEtfPool(
  rawItems: RawEtf[],
  options: SelectEtfPoolOptions = {},
): EtfPoolSelection {
  const reasons = emptyReasons();
  const rejected: RejectedEtf[] = [];
  const accepted: Etf[] = [];

  for (const raw of rawItems) {
    const outcome = normalizeRawEtf(raw, options.premiumRateScale ?? "percent");
    if (outcome.amountInvalid) {
      reasons.amount_invalid += 1;
    }
    if (outcome.rejection) {
      reasons[outcome.rejection.reason] += 1;
      rejected.push(outcome.rejection);
      continue;
    }
    if (outcome.etf) {
      accepted.push(outcome.etf);
    }
  }

  const groups = new Map<string, Etf[]>();
  for (const etf of accepted) {
    const group = groups.get(etf.trackIndex);
    if (group) {
      group.push(etf);
    } else {
      groups.set(etf.trackIndex, [etf]);
    }
  }

  const items: Etf[] = [];
  let duplicateGroups = 0;
  let maxGroupSize = 0;

  for (const group of groups.values()) {
    group.sort(compareRepresentative);
    const winner = group[0];
    if (!winner) {
      continue;
    }
    items.push(winner);

    if (group.length > 1) {
      duplicateGroups += 1;
      maxGroupSize = Math.max(maxGroupSize, group.length);
      for (const loser of group.slice(1)) {
        reasons.duplicate_track_index += 1;
        rejected.push({
          code: loser.code,
          reason: "duplicate_track_index",
          trackIndex: loser.trackIndex,
          scale: loser.scale,
        });
      }
    }
  }

  items.sort((left, right) => {
    if (left.scale !== right.scale) {
      return right.scale - left.scale;
    }
    return left.code.localeCompare(right.code);
  });

  return {
    items,
    sourceTotal: rawItems.length,
    reasons,
    afterBasicFilter: accepted.length,
    duplicateGroups,
    maxGroupSize,
    rejected,
  };
}

function compareRepresentative(left: Etf, right: Etf): number {
  if (left.scale !== right.scale) {
    return right.scale - left.scale;
  }

  const leftAmount = left.amount ?? Number.NEGATIVE_INFINITY;
  const rightAmount = right.amount ?? Number.NEGATIVE_INFINITY;
  if (leftAmount !== rightAmount) {
    return rightAmount - leftAmount;
  }

  return left.code.localeCompare(right.code);
}

function emptyReasons(): Record<SelectionReason, number> {
  return {
    missing_code: 0,
    missing_name: 0,
    missing_track_index: 0,
    debt_name: 0,
    scale_missing_or_invalid: 0,
    scale_below_threshold: 0,
    amount_invalid: 0,
    amount_below_threshold: 0,
    duplicate_track_index: 0,
  };
}
