import type { RawEtf } from "../sources/contracts.js";
import type { Etf, Exchange, RejectedEtf, SelectionReason } from "../domain/etf.js";

export const MIN_ETF_SCALE = 300_000_000;
export const MIN_ETF_AMOUNT = 15_000_000;

export interface NormalizationOutcome {
  etf: Etf | null;
  rejection: RejectedEtf | null;
  amountInvalid: boolean;
}

interface ParsedNumber {
  value: number | null;
  invalid: boolean;
}

export function normalizeRawEtf(
  raw: RawEtf,
  premiumRateScale: "percent" | "fraction" = "percent",
): NormalizationOutcome {
  const code = trimOrNull(raw.securityCode);
  const name = trimOrNull(raw.securityName);
  const trackIndex = trimOrNull(raw.trackIndex);
  const scale = parseNumber(raw.scale);

  if (!code) {
    return reject(null, "missing_code", trackIndex, scale.value);
  }
  if (!name) {
    return reject(code, "missing_name", trackIndex, scale.value);
  }
  if (!trackIndex) {
    return reject(code, "missing_track_index", null, scale.value);
  }
  if (name.includes("短融") || name.includes("债")) {
    return reject(code, "debt_name", trackIndex, scale.value);
  }
  if (scale.value === null || scale.invalid || scale.value < 0) {
    return reject(code, "scale_missing_or_invalid", trackIndex, null);
  }
  if (scale.value < MIN_ETF_SCALE) {
    return reject(code, "scale_below_threshold", trackIndex, scale.value);
  }

  const amount = parseNumber(raw.amount);
  if (!amount.invalid && amount.value !== null && amount.value < MIN_ETF_AMOUNT) {
    return reject(code, "amount_below_threshold", trackIndex, scale.value);
  }

  const premiumRate = parseNumber(raw.premiumRate);
  const normalizedPremiumRate =
    premiumRate.value === null
      ? null
      : premiumRateScale === "percent"
        ? premiumRate.value / 100
        : premiumRate.value;

  return {
    etf: {
      code,
      name,
      exchange: exchangeOf(code),
      scale: scale.value,
      trackingIndex: trimOrNull(raw.trackingIndex),
      trackIndex,
      premiumRate: normalizedPremiumRate,
      amount: amount.invalid ? null : amount.value,
    },
    rejection: null,
    amountInvalid: amount.invalid,
  };
}

function reject(
  code: string | null,
  reason: SelectionReason,
  trackIndex: string | null,
  scale: number | null,
): NormalizationOutcome {
  return {
    etf: null,
    rejection: { code, reason, trackIndex, scale },
    amountInvalid: false,
  };
}

function parseNumber(value: number | string | null | undefined): ParsedNumber {
  if (value === null || value === undefined) {
    return { value: null, invalid: false };
  }
  if (typeof value === "string" && value.trim() === "") {
    return { value: null, invalid: false };
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return { value: null, invalid: true };
  }
  return { value: parsed, invalid: false };
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function exchangeOf(code: string): Exchange {
  if (code.endsWith(".SH")) {
    return "SH";
  }
  if (code.endsWith(".SZ")) {
    return "SZ";
  }
  if (code.endsWith(".BJ")) {
    return "BJ";
  }
  return "OTHER";
}
