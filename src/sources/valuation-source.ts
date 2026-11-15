import type { SourceConfig } from "../config/schemas.js";
import {
  assertBusinessSuccess,
  parseValuationItem,
  parseWirePayload,
  valuationResponseSchema,
} from "./contracts.js";
import { SourceError } from "./errors.js";
import type {
  IndexCode,
  JsonHttpClient,
  RawValuation,
  SourceLogger,
  ValuationType,
} from "./types.js";
import { silentLogger } from "./types.js";

const valuationTypes: readonly ValuationType[] = ["PE", "PB", "PS"];

export class ValuationSource {
  constructor(
    private readonly http: JsonHttpClient,
    private readonly config: SourceConfig,
    private readonly logger: SourceLogger = silentLogger,
  ) {}

  async fetch(indexCode: IndexCode, type: ValuationType): Promise<RawValuation[]> {
    assertIndexCode(indexCode);
    if (!valuationTypes.includes(type)) {
      throw new SourceError({
        code: "SOURCE_UNSUPPORTED",
        message: `Unsupported valuation type: ${String(type)}`,
        retryable: false,
      });
    }

    const result = await this.http.getJson(
      "/fundex-quote/index/valuation",
      {
        securityCode: indexCode,
        valuationType: type,
        timeInterval: this.config.valuationInterval,
      },
      {
        label: `valuation:${indexCode}:${type}`,
        itemCount: valuationItemCount,
      },
    );

    assertBusinessSuccess(result.body, `Valuation ${indexCode} ${type}`);
    const parsed = parseWirePayload(
      valuationResponseSchema,
      result.body,
      `Valuation ${indexCode} ${type}`,
    );
    const rawItems = parsed.data.items ?? [];
    const items: RawValuation[] = [];
    let invalidItems = 0;

    for (const rawItem of rawItems) {
      const item = parseValuationItem(rawItem);
      if (!item) {
        invalidItems += 1;
        continue;
      }
      items.push({
        tradeDate: item.tradeDate,
        valuationValue: item.valuationValue,
        historicalPercentile: item.historicalPercentile ?? null,
        peg: item.peg ?? null,
      });
    }

    if (invalidItems > 0) {
      this.logger.warn(
        { event: "valuation_invalid_items", indexCode, type, invalidItems },
        "Invalid valuation rows were ignored",
      );
    }

    return items;
  }
}

function assertIndexCode(indexCode: string): void {
  if (!indexCode.trim() || !/\.[A-Za-z0-9]+$/.test(indexCode)) {
    throw new SourceError({
      code: "SOURCE_PAYLOAD",
      message: `Index code must include a market suffix: ${indexCode}`,
      retryable: false,
    });
  }
}

function valuationItemCount(body: unknown): number {
  if (!body || typeof body !== "object") {
    return 0;
  }
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return 0;
  }
  const items = (data as { items?: unknown }).items;
  return Array.isArray(items) ? items.length : 0;
}
