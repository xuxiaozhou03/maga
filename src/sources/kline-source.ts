import type { SourceConfig } from "../config/schemas.js";
import { assertBusinessSuccess, klineResponseSchema, parseWirePayload } from "./contracts.js";
import { SourceError } from "./errors.js";
import type { DateString, EtfCode, JsonHttpClient, Kline, SourceLogger } from "./types.js";
import { silentLogger } from "./types.js";

const REQUIRED_COLUMNS = [
  "tradeDate",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "amount",
  "change",
  "changePercent",
] as const;

export class KlineSource {
  constructor(
    private readonly http: JsonHttpClient,
    private readonly config: SourceConfig,
    private readonly logger: SourceLogger = silentLogger,
  ) {}

  async fetchDaily(code: EtfCode, endDate: DateString, limit: number): Promise<Kline[]> {
    assertCodeHasMarketSuffix(code, "ETF");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !isRealDate(endDate)) {
      throw new SourceError({
        code: "SOURCE_PAYLOAD",
        message: `Invalid end date: ${endDate}`,
        retryable: false,
      });
    }
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new SourceError({
        code: "SOURCE_PAYLOAD",
        message: `Invalid Kline limit: ${limit}`,
        retryable: false,
      });
    }

    const result = await this.http.getJson(
      "/fundex-quote/line/kline",
      {
        securityCode: code,
        count: -limit,
        begin: endDate.replaceAll("-", ""),
        period: "day",
        adjust: 1,
      },
      {
        label: `kline:${code}`,
        itemCount: klineItemCount,
      },
    );

    assertBusinessSuccess(result.body, `Kline ${code}`);
    const parsed = parseWirePayload(klineResponseSchema, result.body, `Kline ${code}`);
    return parseKlineItems({
      code,
      columns: parsed.data.columns,
      items: parsed.data.items ?? "",
      endDate,
      limit,
      changePercentScale: this.config.changePercentScale,
      logger: this.logger,
    });
  }
}

export interface ParseKlineOptions {
  code: EtfCode;
  columns: string;
  items: string;
  endDate: DateString;
  limit: number;
  changePercentScale: "percent" | "fraction";
  logger?: SourceLogger;
}

export function parseKlineItems(options: ParseKlineOptions): Kline[] {
  const logger = options.logger ?? silentLogger;
  const columns = options.columns.split(",").map((column) => column.trim());
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missingColumns.length > 0) {
    throw new SourceError({
      code: "SOURCE_PAYLOAD",
      message: `Kline response is missing columns: ${missingColumns.join(",")}`,
      retryable: false,
      context: { code: options.code },
    });
  }

  const rawRows = options.items.split(";").filter((row) => row.trim() !== "");
  const byDate = new Map<string, Kline>();
  let invalidRows = 0;
  let duplicateRows = 0;
  let outOfOrderRows = 0;
  let futureRows = 0;
  let previousDate: string | null = null;

  for (const rawRow of rawRows) {
    const values = rawRow.split(",").map((value) => value.trim());
    if (values.length !== columns.length) {
      invalidRows += 1;
      continue;
    }

    const record = Object.fromEntries(
      columns.map((column, index) => [column, values[index] ?? ""]),
    );
    const date = record.tradeDate ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRealDate(date)) {
      invalidRows += 1;
      continue;
    }

    if (date > options.endDate) {
      futureRows += 1;
      continue;
    }

    const open = parseRequiredNumber(record.open);
    const high = parseRequiredNumber(record.high);
    const low = parseRequiredNumber(record.low);
    const close = parseRequiredNumber(record.close);
    const volume = parseRequiredNumber(record.volume);
    const change = parseRequiredNumber(record.change);
    const rawChangePercent = parseRequiredNumber(record.changePercent);
    const amount = parseOptionalAmount(record.amount);

    if (
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      volume === null ||
      change === null ||
      rawChangePercent === null ||
      amount === undefined
    ) {
      invalidRows += 1;
      continue;
    }

    if (!isValidDailyBar({ open, high, low, close, volume, amount })) {
      invalidRows += 1;
      continue;
    }

    if (previousDate !== null && date < previousDate) {
      outOfOrderRows += 1;
    }
    previousDate = date;

    if (byDate.has(date)) {
      duplicateRows += 1;
    }

    byDate.set(date, {
      code: options.code,
      date,
      open,
      high,
      low,
      close,
      volume,
      amount,
      change,
      changePercent:
        options.changePercentScale === "percent" ? rawChangePercent / 100 : rawChangePercent,
    });
  }

  if (invalidRows > 0) {
    logger.warn(
      { event: "kline_invalid_rows", code: options.code, invalidRows },
      "Invalid Kline rows were ignored",
    );
  }
  if (duplicateRows > 0) {
    logger.warn(
      { event: "kline_duplicate_dates", code: options.code, duplicateRows },
      "Duplicate Kline dates were collapsed, keeping the last row",
    );
  }
  if (outOfOrderRows > 0) {
    logger.warn(
      { event: "kline_out_of_order", code: options.code, outOfOrderRows },
      "Kline rows were sorted by date",
    );
  }
  if (futureRows > 0) {
    logger.warn(
      { event: "kline_future_rows", code: options.code, futureRows },
      "Kline rows after the analysis date were ignored",
    );
  }

  return [...byDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-options.limit);
}

function parseRequiredNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalAmount(value: string | undefined): number | null | undefined {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isValidDailyBar(row: {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number | null;
}): boolean {
  return (
    row.open > 0 &&
    row.high > 0 &&
    row.low > 0 &&
    row.close > 0 &&
    row.high >= row.low &&
    row.volume >= 0 &&
    (row.amount === null || row.amount >= 0)
  );
}

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertCodeHasMarketSuffix(code: string, label: string): void {
  if (!code.trim() || !/\.[A-Za-z0-9]+$/.test(code)) {
    throw new SourceError({
      code: "SOURCE_PAYLOAD",
      message: `${label} code must include a market suffix: ${code}`,
      retryable: false,
    });
  }
}

function klineItemCount(body: unknown): number {
  if (!body || typeof body !== "object") {
    return 0;
  }
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return 0;
  }
  const items = (data as { items?: unknown }).items;
  return typeof items === "string" ? items.split(";").filter((row) => row.trim() !== "").length : 0;
}
