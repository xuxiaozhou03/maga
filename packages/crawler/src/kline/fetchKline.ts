import { saveToFile } from "../utils/file";
import { fetchCheeseApi } from "./fetchCheeseApi";
import { fetchSubscribeShare } from "./fetchSubscribeShare";
import { obfuscateTimestamp } from "./obfuscateTimestamp";
export type DayKv2Row = [
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];
export async function fetchKline(code: string) {
  const timestamp = Date.now();
  const data = await fetchCheeseApi<{
    // date, shares
    floatShares: [number, number][];
    // date, factor
    factors: [number, number][];
    // date, preClose , open, high, low, close, volume, amount
    list: DayKv2Row[];
  }>({
    timestamp,
    url: `https://stock.cheesefortune.com/api/v4/dayKV2/${code.replace(".", "")}?t=${obfuscateTimestamp(timestamp)}`,
    Referer: `https://stock.cheesefortune.com/security/etf/${code}?blank=true`,
  });

  const { list, factors, floatShares } = data;

  const newKline = await fetchSubscribeShare(code, list[list.length - 1][0]);

  if (newKline) {
    list.push([
      newKline.date,
      newKline.preClose,
      newKline.open,
      newKline.high,
      newKline.low,
      newKline.close,
      newKline.volume,
      newKline.amount,
    ]);
  }

  const fields = [
    "date",
    "preClose",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "amount",
    "changePercent",
    "changeAmount",
    "shares",
    "factor",
  ];

  const arr = list.map((row) => {
    const factorRow = factors.find((f) => f[0] === row[0]);
    const sharesRow = floatShares.find((s) => s[0] === row[0]);
    // 涨跌幅: 进行4舍5入，保留两位小数
    const changePercent =
      row[5] !== null && row[1] !== null
        ? Math.round(((row[5] - row[1]) / row[1]) * 10000) / 100
        : null;
    // 涨跌额： 进行4舍5入，保留三位小数
    const changeAmount =
      row[5] !== null && row[1] !== null
        ? Math.round(((row[5] * 1000 - row[1] * 1000) / 1000) * 1000) / 1000
        : null;
    return [
      ...row,
      changePercent,
      changeAmount,
      sharesRow ? sharesRow[1] : null,
      factorRow ? factorRow[1] : null,
    ];
  });

  const csvContent = [
    fields.join(","),
    ...arr.map((row) => row.join(",")),
  ].join("\n");

  await saveToFile(
    `./public/data/${code.replace(".", "_")}_kline.csv`,
    csvContent,
  );
  return { list, factors, floatShares };
}
