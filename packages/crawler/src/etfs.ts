import { EtfRecord } from "./types";
import { saveToFile } from "./utils/file";

const trackingIndexBlackList = ["短融", "城投", "债", "信用"];

interface OriginalEtf {
  securityName: string;
  securityCode: string;
  scale: number | null;
  trackingIndex: string | null;
  trackIndex: string | null;
}

export async function fetchEtfs() {
  const response = await fetch(
    "https://hongsehuojian.com/fundex-quote/allPage/findListByEtf?classA=&classB=&orderBy=l.scale&order=desc&searchValue=&isSelected=&pageNo=1&pageSize=2000&position=",
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        pragma: "no-cache",
        pro: "RedRocket-PC",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
      method: "GET",
    },
  );
  const data = (await response.json()) as {
    data: { data: OriginalEtf[] };
  };
  const list = data.data.data
    .filter((etf) => etf.trackingIndex)
    .filter(
      (etf) =>
        !trackingIndexBlackList.some((item) =>
          etf.trackingIndex?.includes(item),
        ),
    )
    .map<EtfRecord>((item) => {
      return {
        code: item.securityCode,
        name: item.securityName,
        scale: item.scale ?? 0,
        trackingIndex: item.trackingIndex ?? "",
        trackIndex: item.trackIndex!,
      };
    });

  const maga =
    list
      .sort((a, b) => a.trackIndex?.localeCompare(b.trackIndex ?? "") ?? 0)
      .filter((etf) =>
        [
          "NDX.GI",
          "SPTR500N.SPI",
          "NDXTMC.GI",
          "SPX.GI",
          "DJI.GI",
          "750108.MI",
          "NBI.GI",
          "SPSIBI.SPI",
          "SP5CSSUP.SPI",
        ].includes(etf.trackIndex || ""),
      ) ?? null;
  const arr = [["code", "name", "scale", "trackingIndex", "trackIndex"]];
  maga.forEach((etf) => {
    arr.push([
      etf.code,
      etf.name,
      etf.scale.toString(),
      etf.trackingIndex,
      etf.trackIndex || "",
    ]);
  });
  const magaCsv = arr.map((row) => row.join(",")).join("\n");
  await saveToFile("./public/data/maga.csv", magaCsv);

  return maga;
}
