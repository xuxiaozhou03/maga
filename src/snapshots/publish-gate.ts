import type { SnapshotDataStatus } from "../domain/snapshot.js";
import { SnapshotError } from "./errors.js";

export const KLINE_VALID_RATIO_COMPLETE = 0.95;
export const KLINE_VALID_RATIO_MINIMUM = 0.9;
export const POOL_CHANGE_MIN_RATIO = 0.7;
export const POOL_CHANGE_MAX_RATIO = 1.3;

export interface PublicationGateInput {
  poolCount: number;
  klineValidCount: number;
  previousPoolCount: number | null;
  allowPartial: boolean;
  forcePoolChange: boolean;
  requestedDataStatus: SnapshotDataStatus;
}

export interface PublicationGateResult {
  dataStatus: SnapshotDataStatus;
  klineValidRatio: number;
  poolChangeRatio: number | null;
}

export function evaluatePublicationGate(input: PublicationGateInput): PublicationGateResult {
  if (input.poolCount < 1) {
    throw new SnapshotError({
      code: "POOL_EMPTY",
      message: "Snapshot publication requires a non-empty research pool",
      context: { poolCount: input.poolCount },
    });
  }
  if (input.klineValidCount < 0 || input.klineValidCount > input.poolCount) {
    throw new SnapshotError({
      code: "SNAPSHOT_INVALID",
      message: "klineValidCount must be between 0 and poolCount",
      context: { klineValidCount: input.klineValidCount, poolCount: input.poolCount },
    });
  }

  const poolChangeRatio =
    input.previousPoolCount !== null && input.previousPoolCount > 0
      ? input.poolCount / input.previousPoolCount
      : null;
  if (
    poolChangeRatio !== null &&
    !input.forcePoolChange &&
    (poolChangeRatio < POOL_CHANGE_MIN_RATIO || poolChangeRatio > POOL_CHANGE_MAX_RATIO)
  ) {
    throw new SnapshotError({
      code: "POOL_SIZE_CHANGE",
      message: "Research pool size changed outside the allowed range",
      context: {
        previousPoolCount: input.previousPoolCount,
        poolCount: input.poolCount,
        ratio: poolChangeRatio,
      },
    });
  }

  const klineValidRatio = input.klineValidCount / input.poolCount;
  if (klineValidRatio < KLINE_VALID_RATIO_MINIMUM) {
    throw new SnapshotError({
      code: "KLINE_COVERAGE_LOW",
      message: "Kline coverage is below the minimum publication threshold",
      context: { klineValidRatio, minimum: KLINE_VALID_RATIO_MINIMUM },
    });
  }

  const dataStatus: SnapshotDataStatus =
    input.requestedDataStatus === "partial" || klineValidRatio < KLINE_VALID_RATIO_COMPLETE
      ? "partial"
      : "complete";
  if (dataStatus === "partial" && !input.allowPartial) {
    throw new SnapshotError({
      code: "PARTIAL_NOT_ALLOWED",
      message: "Partial snapshots require explicit allowPartial permission",
      context: { klineValidRatio },
    });
  }

  return { dataStatus, klineValidRatio, poolChangeRatio };
}
