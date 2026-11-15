export type DateString = string;
export type EtfCode = string;
export type IndexCode = string;
export type ValuationType = "PE" | "PB" | "PS";

export interface Kline {
  code: EtfCode;
  date: DateString;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number | null;
  change: number;
  changePercent: number;
}

export interface RawValuation {
  tradeDate: string;
  valuationValue: number;
  historicalPercentile: number | null;
  peg: number | null;
}

export interface SourceLogger {
  debug(context: Record<string, unknown>, message?: string): void;
  info(context: Record<string, unknown>, message?: string): void;
  warn(context: Record<string, unknown>, message?: string): void;
  error(context: Record<string, unknown>, message?: string): void;
}

export const silentLogger: SourceLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export type FetchLike = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;

export interface HttpJsonResult {
  body: unknown;
  url: string;
  attempt: number;
  httpStatus: number;
  durationMs: number;
}

export interface HttpJsonRequestOptions {
  label: string;
  itemCount?: (body: unknown) => number;
}

export interface JsonHttpClient {
  getJson(
    path: string,
    params: Record<string, string | number>,
    options: HttpJsonRequestOptions,
  ): Promise<HttpJsonResult>;
}
