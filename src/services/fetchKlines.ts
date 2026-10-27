import dayjs from "dayjs";

export type Kline = {
  code: string;
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

const fetchPageKline = async (code: string, begin: number, count = 1000) => {
  const res = await fetch(
    `https://hongsehuojian.com/fundex-quote/line/kline?securityCode=${code}&count=-${count}&begin=${begin}&period=day&adjust=1&ts=${Date.now()}`,
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        pla: "rr_Mac",
        pragma: "no-cache",
        pro: "RedRocket-PC",
        "sec-ch-ua":
          '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        ver: "",
        Referer: `https://hongsehuojian.com/index/h5/fundexh5bai/index.html?targetPage=indexDetail&securityCode=${code}&pro=RedRocket-PC`,
      },
      body: null,
      method: "GET",
    },
  );
  const ret = (await res.json()) as {
    data: {
      columns: string;
      items: string;
    };
  };
  const columns = ret.data.columns.split(",");
  const items = ret.data.items.split(";").map((item) => {
    const values = item.split(",");
    return columns.reduce(
      (acc, column, index) => {
        if (column === "week") {
          return acc;
        }
        const value = values[index];
        if (column === "tradeDate") {
          acc.date = parseFloat(value.replace(/-/g, ""));
          return acc;
        }
        acc[column as "open"] = parseFloat(value);
        return acc;
      },
      {
        code,
      } as Kline,
    );
  });
  return items;
};

export const fetchKline = async (code: string) => {
  const count = 1000;
  const today = +dayjs().format("YYYYMMDD");
  let begin = today;
  const kline: Kline[] = [];

  while (true) {
    console.log(
      `Fetching Kline data for ETF: ${code} with begin date: ${begin}`,
    );
    const data = await fetchPageKline(code, begin, count);
    if (!data || data.length === 0) {
      break;
    }

    if (begin !== today) {
      kline.unshift(...data.slice(0, data.length - 2));
    } else {
      kline.unshift(...data);
    }

    if (data.length < count) {
      break;
    }
    begin = data[0].date;
  }
  return kline;
};
