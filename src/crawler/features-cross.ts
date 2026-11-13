import { prisma } from "../prisma/index.js";

export async function computeCrossSection(
  poolCodes: string[],
  dates: number[],
) {
  const source = await prisma.feature.findMany({
    where: {
      code: { in: poolCodes },
      date: { in: dates },
      name: { in: ["ret_1m", "vol_20d", "val_percent"] },
    },
  });
  const groups = new Map<string, { code: string; value: number }[]>();
  for (const row of source) {
    const key = `${row.date}|${row.name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ code: row.code, value: row.value });
  }

  const out: { code: string; date: number; name: string; value: number }[] = [];
  for (const [key, rows] of groups) {
    const [dateText, name] = key.split("|");
    const date = Number(dateText);
    rows.sort((a, b) => a.value - b.value);
    rows.forEach((row, index) => {
      const percentile = rows.length > 1 ? index / (rows.length - 1) : 0.5;
      let featureName = "";
      let value = percentile;
      if (name === "ret_1m") {
        featureName = "rank_ret_1m";
      } else if (name === "vol_20d") {
        featureName = "rank_vol_20d";
        value = 1 - percentile;
      } else if (name === "val_percent") {
        featureName = "rank_val_percent";
        value = 1 - percentile;
      }
      if (featureName) {
        out.push({ code: row.code, date, name: featureName, value });
      }
    });
  }
  return out;
}
