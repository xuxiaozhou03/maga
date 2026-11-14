import { Hono } from "hono";
import { prisma } from "../db.js";

export const featuresRoute = new Hono();

const snapshotFeatureNames = [
  "ret_1w",
  "ret_1m",
  "ret_3m",
  "vol_20d",
  "max_dd_60d",
  "ma_dev_20d",
  "turnover_20d",
  "val_percent",
  "rank_ret_1m",
  "rank_vol_20d",
  "rank_val_percent",
] as const;

featuresRoute.get("/", async (context) => {
  const name = context.req.query("name");
  if (!name) return context.json({ error: "name required" }, 400);

  let date = context.req.query("date")
    ? Number(context.req.query("date"))
    : null;
  if (date == null || !Number.isFinite(date)) {
    const latest = await prisma.feature.findFirst({
      where: { name },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    date = latest?.date ?? null;
  }
  if (date == null) return context.json({ date: null, rows: [] });

  const limit = Math.max(
    1,
    Math.min(Number(context.req.query("limit") ?? 20) || 20, 500),
  );
  const rows = await prisma.feature.findMany({
    where: { name, date },
    orderBy: { value: "desc" },
    take: limit,
    select: { code: true, value: true },
  });
  const etfs = await prisma.etf.findMany({
    where: { code: { in: rows.map((row) => row.code) } },
    select: { code: true, name: true },
  });
  const names = new Map(etfs.map((etf) => [etf.code, etf.name]));
  return context.json({
    date,
    rows: rows.map((row, index) => ({
      ...row,
      rank: index + 1,
      etfName: names.get(row.code) ?? "",
    })),
  });
});

featuresRoute.get("/snapshot", async (context) => {
  const latest = await prisma.feature.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) return context.json({ date: null, rows: [] });

  const rows = await prisma.feature.findMany({
    where: {
      date: latest.date,
      name: { in: [...snapshotFeatureNames] },
    },
    select: { code: true, name: true, value: true },
  });
  const byCode = new Map<string, Record<string, number>>();
  for (const row of rows) {
    if (!byCode.has(row.code)) byCode.set(row.code, {});
    byCode.get(row.code)![row.name] = row.value;
  }

  return context.json({
    date: latest.date,
    rows: [...byCode].map(([code, features]) => ({ code, ...features })),
  });
});

featuresRoute.get("/:code", async (context) => {
  const code = context.req.param("code");
  const names = (context.req.query("names") ?? "")
    .split(",")
    .filter(Boolean);
  const start = Number(context.req.query("start") ?? 0);
  const end = Number(context.req.query("end") ?? 99999999);
  const where: {
    code: string;
    date: { gte: number; lte: number };
    name?: { in: string[] };
  } = { code, date: { gte: start, lte: end } };
  if (names.length) where.name = { in: names };

  const rows = await prisma.feature.findMany({
    where,
    orderBy: [{ name: "asc" }, { date: "asc" }],
  });
  return context.json(rows);
});
