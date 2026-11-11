// import { Kline, prisma } from "@maga/db";
// import { Task } from "../utils";

// const getEtfStatistics = (klines: Kline[]) => {
//   // upDays	上涨天数
//   const upDays = klines.filter((kline) => kline.changePercent > 0).length;
//   // downDays	下跌天数
//   const downDays = klines.filter((kline) => kline.changePercent < 0).length;
//   // flatDays	平盘天数
//   const flatDays = klines.filter((kline) => kline.changePercent === 0).length;
//   // upRatio	上涨天数占比
//   const upRatio = upDays / klines.length;
//   // maxDailyGain	最大单日涨幅
//   const maxDailyGain = Math.max(...klines.map((kline) => kline.changePercent));
//   // maxDailyLoss	最大单日跌幅
//   const maxDailyLoss = Math.min(...klines.map((kline) => kline.changePercent));
//   // averageDailyReturn	平均日收益率
//   const averageDailyReturn =
//     klines.reduce((acc, kline) => acc + kline.changePercent, 0) / klines.length;
//   // medianDailyReturn	日收益率中位数
//   const medianDailyReturn = (() => {
//     const sortedReturns = klines
//       .map((kline) => kline.changePercent)
//       .sort((a, b) => a - b);
//     const mid = Math.floor(sortedReturns.length / 2);
//     return sortedReturns.length % 2 !== 0
//       ? sortedReturns[mid]
//       : (sortedReturns[mid - 1] + sortedReturns[mid]) / 2;
//   })();

//   // 涨跌统计
//   const statistics = {
//     upDays,
//     downDays,
//     flatDays,
//     upRatio,
//     maxDailyGain,
//     maxDailyLoss,
//     averageDailyReturn,
//     medianDailyReturn,
//   };

//   // 周期收益

//   const periodReturn = {};

//   return statistics;
// };

// // 单个ETF的统计数据抓取任务
// export const getEtfStatisticsTask = (code: string): Task<Kline[]> => ({
//   name: `${code}-statistics`,
//   fetch: async () => {
//     return await prisma.kline.findMany({
//       where: { code },
//       orderBy: { date: "asc" },
//     });
//   },
//   save: async (data) => {
//     const reuslt = getEtfStatistics(data);
//     console.log(reuslt);
//     // Save the fetched Kline data to the database
//     // Implement your saving logic here
//   },
// });
