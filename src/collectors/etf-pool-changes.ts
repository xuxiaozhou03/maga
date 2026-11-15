import type { Etf } from "../domain/etf.js";

export interface RepresentativeChange {
  trackIndex: string;
  previousCode: string;
  newCode: string;
}

export interface PoolChangeSummary {
  membershipChanged: boolean;
  representativeChanges: RepresentativeChange[];
  addedCodes: string[];
  removedCodes: string[];
}

export function summarizePoolChanges(previousItems: Etf[], nextItems: Etf[]): PoolChangeSummary {
  const previousByTrack = new Map(previousItems.map((etf) => [etf.trackIndex, etf]));
  const nextByTrack = new Map(nextItems.map((etf) => [etf.trackIndex, etf]));
  const representativeChanges: RepresentativeChange[] = [];

  for (const [trackIndex, next] of nextByTrack) {
    const previous = previousByTrack.get(trackIndex);
    if (previous && previous.code !== next.code) {
      representativeChanges.push({
        trackIndex,
        previousCode: previous.code,
        newCode: next.code,
      });
    }
  }

  const addedCodes = nextItems
    .filter((etf) => !previousItems.some((previous) => previous.code === etf.code))
    .map((etf) => etf.code);
  const removedCodes = previousItems
    .filter((etf) => !nextItems.some((next) => next.code === etf.code))
    .map((etf) => etf.code);

  return {
    membershipChanged:
      representativeChanges.length > 0 ||
      addedCodes.length > 0 ||
      removedCodes.length > 0 ||
      previousByTrack.size !== nextByTrack.size,
    representativeChanges: representativeChanges.sort((left, right) =>
      left.trackIndex.localeCompare(right.trackIndex),
    ),
    addedCodes: addedCodes.sort(),
    removedCodes: removedCodes.sort(),
  };
}
