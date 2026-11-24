import fs from "fs";
import { Etf } from "../crawler/fetchEtfs";
import { fetchKline, Kline } from "../crawler/fetchKline";
import dayjs from "dayjs";

const calculatePeriodPerformance = (klines: Kline[]) => {
  const Periods = {
    "1w": 5,
    "1m": 21,
    "3m": 63,
    "6m": 126,
    "1y": 252,
    "3y": 756,
    "5y": 1260,
    ytd: klines.findIndex((kline) =>
      dayjs(kline.date + "").isAfter(dayjs().startOf("year")),
    ),
    all: klines.length,
  } as const;

  const current = klines[klines.length - 1];

  const calcPerformance = (startIndex: number) => {
    const prev = klines[startIndex - 1] || klines[0];
    const rangeKlines = klines.slice(startIndex);
    const changePercents = rangeKlines.map((kline) => kline.changePercent);
    const tradingDays = rangeKlines.length;

    const upDays = changePercents.filter((a) => a > 0).length;
    const downDays = changePercents.filter((a) => a < 0).length;
    const flatDays = changePercents.filter((a) => a === 0).length;

    return {
      startDate: klines[startIndex].date,
      endDate: current.date,

      // 周期累计收益率
      totalReturn: current.close / prev.close - 1,

      // 上涨天数
      upDays,
      upDayRatio: upDays / tradingDays,
      // 下跌天数
      downDays,
      downDayRatio: downDays / tradingDays,
      flatDays,
      /** 上涨天数 / 下跌天数 */
      upDownDayRatio: upDays / downDays,
    };
  };

  const performance = Object.keys(Periods).reduce(
    (prev, cur) => {
      return {
        ...prev,
        [cur]: calcPerformance(
          klines.length - Periods[cur as keyof typeof Periods] < 0
            ? 0
            : klines.length - Periods[cur as keyof typeof Periods],
        ),
      };
    },
    {} as Record<string, ReturnType<typeof calcPerformance>>,
  );

  return performance;
};

export const analyzeEtf = async (etf: Etf) => {
  const klines = await fetchKline(etf.code);
  if (!klines.length) {
    return;
  }

  fs.writeFileSync(
    "test.json",
    JSON.stringify({
      a: calculatePeriodPerformance(klines),
      klines,
    }),
  );
  return klines;
};
