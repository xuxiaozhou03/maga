import type { Task } from "../utils/runTask.js";
import { prisma } from "../prisma/index.js";
import { computeSingleFeatures, SINGLE_FEATURES } from "./features.js";
import { computeCrossSection } from "./features-cross.js";

type FeatureRow = { date: number; name: string; value: number };
type RankRow = FeatureRow & { code: string };

export const getFeatureTask = (code: string): Task<FeatureRow[]> => ({
  name: `${code}-features`,
  fetch: async () => {
    const bars = await prisma.kline.findMany({
      where: { code },
      orderBy: { date: "asc" },
    });
    if (bars.length < 6) return [];

    const etf = await prisma.etf.findUnique({ where: { code } });
    const trackIndex = etf?.trackIndex ?? "";
    const valuations = trackIndex
      ? await prisma.valuation.findMany({
          where: { code: trackIndex, type: "PE" },
          orderBy: { date: "asc" },
        })
      : [];

    return computeSingleFeatures(
      bars.map((bar) => ({
        code: bar.code,
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        amount: bar.amount,
        change: bar.change,
        changePercent: bar.changePercent,
      })),
      valuations.map((valuation) => ({
        date: valuation.date,
        percent: valuation.percent,
      })),
    );
  },
  save: async (rows) => {
    await prisma.$transaction(async (tx) => {
      await tx.feature.deleteMany({
        where: { code, name: { in: [...SINGLE_FEATURES] } },
      });
      if (rows.length) {
        await tx.feature.createMany({
          data: rows.map((row) => ({ code, ...row })),
        });
      }
    });
  },
});

export const getCrossSectionTask = (): Task<RankRow[]> => ({
  name: "feature-cross",
  fetch: async () => {
    const codes = (await prisma.etf.findMany({ select: { code: true } })).map(
      (etf) => etf.code,
    );
    if (!codes.length) return [];

    const recent = await prisma.kline.findMany({
      select: { date: true },
      orderBy: { date: "desc" },
      distinct: ["date"],
      take: 30,
    });
    return computeCrossSection(
      codes,
      recent.map((row) => row.date),
    );
  },
  save: async (rows) => {
    const ranks = ["rank_ret_1m", "rank_vol_20d", "rank_val_percent"];
    await prisma.$transaction(async (tx) => {
      await tx.feature.deleteMany({ where: { name: { in: ranks } } });
      if (rows.length) {
        await tx.feature.createMany({ data: rows });
      }
    });
  },
});
