import type { SourceConfig } from "../config/schemas.js";
import { logger as defaultLogger } from "../logging.js";
import { EtfSource } from "./etf-source.js";
import { HttpClient, type HttpClientDependencies } from "./http.js";
import { KlineSource } from "./kline-source.js";
import type { SourceLogger } from "./types.js";
import { ValuationSource } from "./valuation-source.js";

export interface SourceServices {
  http: HttpClient;
  etfs: EtfSource;
  klines: KlineSource;
  valuations: ValuationSource;
}

export interface CreateSourcesOptions extends Omit<HttpClientDependencies, "logger"> {
  logger?: SourceLogger;
}

export function createSources(
  config: SourceConfig,
  options: CreateSourcesOptions = {},
): SourceServices {
  const logger = options.logger ?? defaultLogger;
  const http = new HttpClient(config, { ...options, logger });

  return {
    http,
    etfs: new EtfSource(http, config, logger),
    klines: new KlineSource(http, config, logger),
    valuations: new ValuationSource(http, config, logger),
  };
}
