import type { SourceConfig } from "../config/schemas.js";
import {
  assertBusinessSuccess,
  etfListResponseSchema,
  parseWirePayload,
  type RawEtf,
} from "./contracts.js";
import { SourceError } from "./errors.js";
import type { JsonHttpClient, SourceLogger } from "./types.js";
import { silentLogger } from "./types.js";

const MAX_PAGES = 10;

export class EtfSource {
  constructor(
    private readonly http: JsonHttpClient,
    private readonly config: SourceConfig,
    private readonly logger: SourceLogger = silentLogger,
  ) {}

  async fetchAll(): Promise<RawEtf[]> {
    const items: RawEtf[] = [];
    const seenCodes = new Set<string>();
    let total = 0;
    let duplicateCount = 0;

    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
      const result = await this.http.getJson(
        "/fundex-quote/allPage/findListByEtf",
        {
          classA: "",
          classB: "",
          orderBy: "l.scale",
          order: "desc",
          searchValue: "",
          isSelected: "",
          pageNo,
          pageSize: this.config.etfPageSize,
          position: "",
        },
        {
          label: `etf-list:${pageNo}`,
          itemCount: etfListItemCount,
        },
      );

      assertBusinessSuccess(result.body, `ETF list page ${pageNo}`);
      const parsed = parseWirePayload(etfListResponseSchema, result.body, "ETF list");
      if (pageNo === 1) {
        total = parsed.data.total;
      }

      const rows = parsed.data.data;
      const countBeforePage = items.length;
      for (const row of rows) {
        const code = row.securityCode?.trim();
        if (code && seenCodes.has(code)) {
          duplicateCount += 1;
          continue;
        }
        if (code) {
          seenCodes.add(code);
        }
        items.push(row);
      }

      if (items.length >= total) {
        break;
      }

      if (rows.length === 0) {
        this.logger.warn(
          { event: "etf_pagination", pageNo, total, collected: items.length },
          "ETF pagination returned an empty page before total was reached",
        );
        break;
      }

      if (items.length === countBeforePage) {
        this.logger.warn(
          { event: "etf_pagination", pageNo, total, collected: items.length },
          "ETF pagination made no progress; stop to avoid an infinite loop",
        );
        break;
      }

      if (pageNo === MAX_PAGES && items.length < total) {
        throw new SourceError({
          code: "SOURCE_PAYLOAD",
          message: "ETF pagination exceeded the 10-page guard",
          retryable: false,
          context: { total, collected: items.length },
        });
      }
    }

    if (duplicateCount > 0) {
      this.logger.warn(
        { event: "etf_list_duplicates", duplicateCount },
        "Duplicate ETF codes were ignored after the first occurrence",
      );
    }

    if (total > 0 && Math.abs(items.length - total) / total > 0.1) {
      this.logger.warn(
        { event: "etf_list_count_mismatch", total, collected: items.length },
        "ETF list count differs from upstream total by more than 10%",
      );
    }

    return items;
  }
}

function etfListItemCount(body: unknown): number {
  if (!body || typeof body !== "object") {
    return 0;
  }

  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return 0;
  }

  const rows = (data as { data?: unknown }).data;
  return Array.isArray(rows) ? rows.length : 0;
}
