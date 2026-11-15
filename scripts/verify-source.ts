import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sourceConfigSchema, type SourceConfig } from "../src/config/schemas.js";
import {
  createSources as createSourceServices,
  silentLogger,
  type SourceServices,
} from "../src/sources/index.js";

const sourceConfigPath = fileURLToPath(
  new URL("../data/config/source-config.json", import.meta.url),
);

const requestedValuationCodes = [
  "000300.SH",
  "000905.SH",
  "399006.SZ",
  "HSI.HI",
  "NDX.GI",
  "SPX.GI",
];

type ValuationCoverage = {
  code: string;
  rows: number;
  latestDate: string | null;
  latestPercentile: number | null;
  status: "supported" | "unsupported" | "failed";
  error?: string;
};

function createSources(config: SourceConfig): SourceServices {
  return createSourceServices(config, { logger: silentLogger });
}

function parseFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasMarketSuffix(code: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(code);
}

function shanghaiDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function verifyEtfs(sources: SourceServices): Promise<void> {
  const items = await sources.etfs.fetchAll();
  const first = items[0];
  if (!first) {
    throw new Error("ETF list returned no rows");
  }

  const missingCodes = items.filter((item) => !item.securityCode?.trim()).length;
  const withMarketSuffix = items.filter((item) => {
    const code = item.securityCode?.trim();
    return code ? hasMarketSuffix(code) : false;
  }).length;
  const missingTrackIndex = items.filter((item) => !item.trackIndex?.trim()).length;
  const scale = parseFiniteNumber(first.scale);
  const amount = parseFiniteNumber(first.amount);
  const premiumRate = parseFiniteNumber(first.premiumRate);

  console.log("\n[1/3] ETF 列表");
  console.log(`  total=${items.length} withMarketSuffix=${withMarketSuffix}`);
  console.log(`  missingCodes=${missingCodes} missingTrackIndex=${missingTrackIndex}`);
  console.log(
    `  sample=${first.securityCode ?? "null"} trackIndex=${first.trackIndex ?? "null"} scale=${scale ?? "null"} amount=${amount ?? "null"}`,
  );
  console.log(
    `  premiumRate=${premiumRate ?? "null"} -> internal=${premiumRate === null ? "null" : premiumRate / 100}`,
  );

  if (missingCodes > 0 || withMarketSuffix !== items.length) {
    throw new Error("Some ETF codes are missing or have no market suffix");
  }
  if (!first.trackIndex || !hasMarketSuffix(first.trackIndex)) {
    throw new Error("First ETF trackIndex is missing a market suffix");
  }
}

async function verifyKline(sources: SourceServices): Promise<void> {
  const code = "510300.SH";
  const bars = await sources.klines.fetchDaily(code, shanghaiDate(), 10);
  const latest = bars.at(-1);
  if (!latest) {
    throw new Error(`Kline returned no rows for ${code}`);
  }

  console.log("\n[2/3] 日 K");
  console.log(`  rows=${bars.length} first=${bars[0]?.date ?? "null"} latest=${latest.date}`);
  console.log(
    `  latest open=${latest.open} high=${latest.high} low=${latest.low} close=${latest.close}`,
  );
  console.log(
    `  changePercent=${(latest.changePercent * 100).toFixed(4)}% -> internal=${latest.changePercent}`,
  );
  console.log("  adjust=1 已确认为前复权；全系统统一使用，不做二次复权或校准。");
}

async function fetchValuation(sources: SourceServices, code: string): Promise<ValuationCoverage> {
  try {
    const items = await sources.valuations.fetch(code, "PE");
    const latest = items[0];

    return {
      code,
      rows: items.length,
      latestDate: latest?.tradeDate ?? null,
      latestPercentile: latest?.historicalPercentile ?? null,
      status: items.length > 0 ? "supported" : "unsupported",
    };
  } catch (error) {
    return {
      code,
      rows: 0,
      latestDate: null,
      latestPercentile: null,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function verifyValuations(sources: SourceServices): Promise<void> {
  const coverage: ValuationCoverage[] = [];
  for (const code of requestedValuationCodes) {
    coverage.push(await fetchValuation(sources, code));
  }

  console.log("\n[3/3] 指数估值（PE）");
  for (const item of coverage) {
    const percentile =
      item.latestPercentile === null
        ? "null"
        : `${item.latestPercentile} -> ${item.latestPercentile / 100}`;
    console.log(
      `  ${item.code} status=${item.status} rows=${item.rows} latest=${item.latestDate ?? "null"} percentile=${percentile}`,
    );
    if (item.error) {
      console.log(`    error=${item.error}`);
    }
  }

  const core = coverage.find((item) => item.code === "000300.SH");
  if (!core || core.status !== "supported") {
    throw new Error("Core valuation 000300.SH PE is unavailable");
  }
  if (
    core.latestPercentile !== null &&
    (core.latestPercentile < 0 || core.latestPercentile > 100)
  ) {
    throw new Error(`000300.SH percentile is outside 0-100: ${core.latestPercentile}`);
  }

  const supported = coverage.filter((item) => item.status === "supported").length;
  console.log(
    `  coverage=${supported}/${coverage.length}; data 为空或 items 缺失表示该指数该类型无数据。`,
  );
}

async function main(): Promise<void> {
  const rawConfig: unknown = JSON.parse(await readFile(sourceConfigPath, "utf8"));
  const config = sourceConfigSchema.parse(rawConfig);
  const sources = createSources(config);

  console.log("ETF 市场分析系统 V0.5.1 - 上游接口验证");
  console.log(`baseUrl=${config.baseUrl} timeoutMs=${config.timeoutMs} retries=${config.retries}`);

  await verifyEtfs(sources);
  await verifyKline(sources);
  await verifyValuations(sources);

  console.log("\n[结论] 核心接口验证通过。");
  console.log("未验证：最新数据可用时点、上游限流阈值、数据使用条款。");
}

main().catch((error: unknown) => {
  console.error("\n[失败]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
