import { Hono } from "hono";
import { prisma } from "../db.js";

export const etfsRoute = new Hono();

const valuationTypes = ["PE", "PB", "PS", "DID"] as const;

type KlineRow = {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  change: number;
  changePercent: number;
};

type EtfOverviewRow = {
  code: string;
  name: string;
  trackingIndex: string;
  scale: number;
  premiumRate: number | null;
  latestDate: number | null;
  latestClose: number | null;
  latestChangePercent: number | null;
  latestAmount: number | null;
  latestVolume: number | null;
  close5: number | null;
  close20: number | null;
  close60: number | null;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const stdev = (values: number[]) => {
  if (values.length < 2) return null;
  const average = mean(values);
  if (average == null) return null;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
};

const movingAverage = (rows: KlineRow[], period: number) => {
  if (rows.length < period) return null;
  const average = mean(rows.slice(-period).map((row) => row.close));
  return average == null ? null : Number(average.toFixed(6));
};

const round = (value: number | null, digits = 6) =>
  value == null || !Number.isFinite(value)
    ? null
    : Number(value.toFixed(digits));

function buildStats(rows: KlineRow[], base: KlineRow | undefined) {
  if (!rows.length) return null;

  const first = rows[0];
  const latest = rows[rows.length - 1];
  const rangeReturn = first.close > 0 ? latest.close / first.close - 1 : null;
  const tradingDays = rows.length;
  const annualReturn =
    rangeReturn != null && tradingDays > 0
      ? Math.pow(1 + rangeReturn, 252 / tradingDays) - 1
      : null;

  const closeSequence = [base?.close, ...rows.map((row) => row.close)].filter(
    (value): value is number => value != null && Number.isFinite(value) && value > 0,
  );
  const dailyReturns: number[] = [];
  for (let index = 1; index < closeSequence.length; index += 1) {
    dailyReturns.push(closeSequence[index] / closeSequence[index - 1] - 1);
  }
  const dailyVolatility = stdev(dailyReturns);
  const volatility =
    dailyVolatility == null ? null : dailyVolatility * Math.sqrt(252);
  const averageReturn = mean(dailyReturns);
  const sharpe =
    averageReturn != null && dailyVolatility != null && dailyVolatility > 0
      ? (averageReturn / dailyVolatility) * Math.sqrt(252)
      : null;

  let peakClose = Number.NEGATIVE_INFINITY;
  let peakDate = rows[0].date;
  let maxDrawdown = 0;
  let maxDrawdownPeakDate = rows[0].date;
  let maxDrawdownTroughDate = rows[0].date;
  for (const row of rows) {
    if (row.close > peakClose) {
      peakClose = row.close;
      peakDate = row.date;
    }
    const drawdown = peakClose > 0 ? row.close / peakClose - 1 : 0;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPeakDate = peakDate;
      maxDrawdownTroughDate = row.date;
    }
  }

  const highRow = rows.reduce((best, row) => (row.high > best.high ? row : best));
  const lowRow = rows.reduce((best, row) => (row.low < best.low ? row : best));
  const upDays = dailyReturns.filter((value) => value > 0).length;
  const downDays = dailyReturns.filter((value) => value < 0).length;
  const flatDays = dailyReturns.length - upDays - downDays;
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const totalVolume = rows.reduce((sum, row) => sum + row.volume, 0);
  const currentDrawdown = peakClose > 0 ? latest.close / peakClose - 1 : null;

  return {
    range: { start: first.date, end: latest.date },
    tradingDays,
    latest: {
      date: latest.date,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      close: latest.close,
      volume: latest.volume,
      amount: latest.amount,
      change: latest.change,
      changePercent: latest.changePercent,
    },
    return: round(rangeReturn),
    annualReturn: round(annualReturn),
    volatility: round(volatility),
    sharpe: round(sharpe, 4),
    maxDrawdown: round(maxDrawdown),
    maxDrawdownPeakDate,
    maxDrawdownTroughDate,
    currentDrawdown: round(currentDrawdown),
    high: highRow.high,
    highDate: highRow.date,
    low: lowRow.low,
    lowDate: lowRow.date,
    winRate: dailyReturns.length ? round(upDays / dailyReturns.length) : null,
    upDays,
    downDays,
    flatDays,
    avgAmount: Math.round(totalAmount / tradingDays),
    avgVolume: round(totalVolume / tradingDays, 2),
    totalAmount: round(totalAmount, 2),
    ma5: movingAverage(rows, 5),
    ma20: movingAverage(rows, 20),
    ma60: movingAverage(rows, 60),
  };
}

etfsRoute.get("/", async (context) => {
  const query = (context.req.query("q") ?? "").trim();
  const limit = clamp(
    Math.trunc(Number(context.req.query("limit") ?? 300) || 300),
    1,
    500,
  );
  const rows = await prisma.etf.findMany({
    where: query
      ? {
          OR: [
            { code: { contains: query.toUpperCase() } },
            { name: { contains: query } },
            { trackingIndex: { contains: query } },
          ],
        }
      : undefined,
    orderBy: { scale: "desc" },
    take: limit,
    select: {
      code: true,
      name: true,
      trackingIndex: true,
      scale: true,
      premiumRate: true,
    },
  });
  return context.json({ rows });
});

etfsRoute.get("/overview", async (context) => {
  const rows = await prisma.$queryRaw<EtfOverviewRow[]>`
    SELECT
      e.code AS code,
      e.name AS name,
      e.trackingIndex AS "trackingIndex",
      e.scale AS scale,
      e.premiumRate AS "premiumRate",
      l.date AS "latestDate",
      l.close AS "latestClose",
      l.changePercent AS "latestChangePercent",
      l.amount AS "latestAmount",
      l.volume AS "latestVolume",
      (SELECT close FROM kline WHERE code = e.code ORDER BY date DESC LIMIT 1 OFFSET 5) AS "close5",
      (SELECT close FROM kline WHERE code = e.code ORDER BY date DESC LIMIT 1 OFFSET 20) AS "close20",
      (SELECT close FROM kline WHERE code = e.code ORDER BY date DESC LIMIT 1 OFFSET 60) AS "close60"
    FROM etf e
    LEFT JOIN kline l
      ON l.code = e.code
      AND l.date = (SELECT MAX(latest.date) FROM kline latest WHERE latest.code = e.code)
    ORDER BY e.scale DESC
  `;

  const change = (latest: number | null, base: number | null) =>
    latest != null && base != null && base > 0 ? latest / base - 1 : null;
  const mapped = rows.map((row) => ({
    ...row,
    ret5: change(row.latestClose, row.close5),
    ret20: change(row.latestClose, row.close20),
    ret60: change(row.latestClose, row.close60),
  }));
  const priced = mapped.filter((row) => row.latestDate != null);
  const asOf = priced.length
    ? Math.max(...priced.map((row) => row.latestDate as number))
    : null;
  const totalScale = mapped.reduce((sum, row) => sum + (row.scale ?? 0), 0);
  const totalAmount = priced.reduce(
    (sum, row) => sum + (row.latestAmount ?? 0),
    0,
  );

  return context.json({
    asOf,
    summary: {
      count: mapped.length,
      priced: priced.length,
      totalScale,
      totalAmount,
      up: priced.filter((row) => (row.latestChangePercent ?? 0) > 0).length,
      down: priced.filter((row) => (row.latestChangePercent ?? 0) < 0).length,
      flat: priced.filter((row) => (row.latestChangePercent ?? 0) === 0).length,
    },
    rows: mapped,
  });
});

etfsRoute.get("/:code/valuation", async (context) => {
  const etf = await prisma.etf.findUnique({
    where: { code: context.req.param("code") },
    select: { trackingIndex: true, trackIndex: true },
  });
  if (!etf) return context.json({ error: "ETF not found" }, 404);

  const rows = etf.trackIndex
    ? await prisma.valuation.findMany({
        where: { code: etf.trackIndex },
        orderBy: [{ date: "asc" }, { type: "asc" }],
        select: {
          date: true,
          type: true,
          value: true,
          percent: true,
          peg: true,
        },
      })
    : [];

  const normalized = rows.map((row) => ({
    ...row,
    value: round(row.value, 4),
    percent: round(row.percent, 6),
    peg: round(row.peg, 4),
  }));
  const latestByType = new Map(
    normalized.map((row) => [row.type, row] as const),
  );

  return context.json({
    indexCode: etf.trackIndex || null,
    trackingIndex: etf.trackingIndex,
    types: valuationTypes.map((type) => ({
      type,
      latest: latestByType.get(type) ?? null,
    })),
    rows: normalized,
  });
});

etfsRoute.get("/:code/distribution", async (context) => {
  const etf = await prisma.etf.findUnique({
    where: { code: context.req.param("code") },
    select: { trackingIndex: true, trackIndex: true },
  });
  if (!etf) return context.json({ error: "ETF not found" }, 404);

  const rows = etf.trackIndex
    ? await prisma.distribution.findMany({
        where: { code: etf.trackIndex },
        orderBy: [{ weight: "desc" }, { industryName: "asc" }],
        select: { industryName: true, weight: true },
      })
    : [];
  const normalized = rows.map((row) => ({
    ...row,
    weight: round(row.weight, 4) ?? 0,
  }));

  return context.json({
    indexCode: etf.trackIndex || null,
    trackingIndex: etf.trackingIndex,
    totalWeight: round(
      normalized.reduce((sum, row) => sum + row.weight, 0),
      4,
    ),
    rows: normalized,
  });
});

etfsRoute.get("/:code", async (context) => {
  const code = context.req.param("code");
  const etf = await prisma.etf.findUnique({ where: { code } });
  if (!etf) return context.json({ error: "ETF not found" }, 404);

  const startValue = Math.trunc(Number(context.req.query("start")));
  const endValue = Math.trunc(Number(context.req.query("end")));
  const limit = clamp(
    Math.trunc(Number(context.req.query("limit") ?? 750) || 750),
    1,
    6000,
  );
  const where = {
    code,
    ...(Number.isFinite(startValue) && startValue > 0
      ? { date: { gte: startValue } }
      : {}),
    ...(Number.isFinite(endValue) && endValue > 0
      ? { date: { ...(Number.isFinite(startValue) && startValue > 0 ? { gte: startValue } : {}), lte: endValue } }
      : {}),
  };

  const fetched = await prisma.kline.findMany({
    where,
    orderBy: { date: "desc" },
    take: limit + 1,
    select: {
      date: true,
      open: true,
      high: true,
      low: true,
      close: true,
      volume: true,
      amount: true,
      change: true,
      changePercent: true,
    },
  });
  const hasBase = fetched.length > limit;
  const base = hasBase ? fetched[fetched.length - 1] : undefined;
  const rows = (hasBase ? fetched.slice(0, limit) : fetched).reverse();

  return context.json({
    etf,
    klines: rows,
    stats: buildStats(rows, base),
  });
});
