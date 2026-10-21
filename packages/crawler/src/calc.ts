import { Kline, prisma } from "@maga/db";
import { Task } from "./utils";

export const getCalcTask = (code: string): Task<Kline[]> => {
  return {
    name: `${code}_calc`,
    fetch: async () => {
      const klines = await prisma.kline.findMany({
        where: { code },
        orderBy: { date: "desc" },
      });
      return klines;
    },
    async save(klines) {
      // 阶段涨幅
      // 涨跌分布
      console.log(klines);
    },
  };
};
