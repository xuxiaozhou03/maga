interface OriginalEtf {
  securityName: string;
  securityCode: string;
  scale: number | null;
  trackingIndex: string | null;
  trackIndex: string | null;
  premiumRate: string | number | null;
}

export async function fetchEtfs() {
  const ret = await fetch(
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
  const res = (await ret.json()) as {
    data: { data: OriginalEtf[] };
  };

  return res.data.data

    .map((originEtf) => {
      const etf = {
        code: originEtf.securityCode,
        name: originEtf.securityName,
        scale: originEtf.scale ?? 0,
        trackingIndex: originEtf.trackingIndex ?? "",
        trackIndex: originEtf.trackIndex!,
        premiumRate: originEtf.premiumRate
          ? parseFloat(originEtf.premiumRate + "")
          : null,
      };
      return etf;
    })
    .filter((etf) => {
      return [
        "NDX.GI",
        "SPTR500N.SPI",
        "NDXTMC.GI",
        "SPX.GI",
        "DJI.GI",
        "750108.MI",
        "NBI.GI",
        "SPSIBI.SPI",
        "SP5CSSUP.SPI",
      ].includes(etf.trackIndex);
    });
}
