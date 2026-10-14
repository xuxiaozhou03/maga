import { fetchCheeseApi } from "./fetchCheeseApi";

type SubscribeShareRow = [
  string,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

interface CurrentKlineData {
  date: number;
  preClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  amount: number | null;
}

export async function fetchSubscribeShare(
  code: string,
  lastDate: number,
  days = 5,
) {
  const response = await fetchCheeseApi<SubscribeShareRow[]>({
    timestamp: Date.now(),
    url: `https://stock.cheesefortune.com/api/v2/k/subscribeShare?code=${code}&days=${days}&isCN=true`,
    Referer: `https://stock.cheesefortune.com/security/etf/${code}?blank=true`,
  });
  const newDate = +response[response.length - 1][0];

  if (newDate === lastDate) {
    return null;
  }

  const newDateIndex = response.findIndex((row) => +row[0] === newDate);
  const prevClose = response[newDateIndex - 1][1];

  const minuteData = response.slice(newDateIndex);
  const prices = minuteData
    .filter((row) => row[2] !== 0)
    .map((row) => row[1])
    .filter((price) => price !== null);
  const currentKlineData: CurrentKlineData = {
    date: newDate,
    preClose: prevClose,
    open: minuteData.find((row) => row[2] !== 0)?.[1] ?? null,
    high: Math.max(...prices),
    low: Math.min(...prices),
    close: minuteData[minuteData.length - 1][1],
    volume: minuteData.reduce((acc, row) => acc + (row[2] ?? 0), 0),
    amount: minuteData.reduce((acc, row) => acc + (row[3] ?? 0), 0),
  };

  return currentKlineData;
}
