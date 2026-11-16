import { fetchCheeseApi, generateV4Timestamp } from "./utils/fetchCheeseApi";

async function fetchLinkFund(code: string, codes: string[]) {
  try {
    const timestamp = Date.now();
    const t = generateV4Timestamp(String(timestamp));

    const encodedCode = encodeURIComponent(code);

    const result = await fetchCheeseApi<{
      etfs: Array<{
        similar: number;
        code: string;
        scale: number;
      }>;
    }>({
      url: `https://stock.cheesefortune.com/api/v4/etf/linkFund/${encodedCode}?t=${t}`,
      Referer: `https://stock.cheesefortune.com/security/etf/${encodedCode}?blank=true`,
      timestamp,
    });
    return result?.etfs
      ?.filter((item) => codes.includes(item.code))
      ?.map((item) => ({
        target: code,
        source: item.code,
        scale: item.scale,
        similar: item.similar,
      }));
  } catch (error) {
    console.error(
      `[Cheese API] 获取关联基金失败: ${code}`,
      error instanceof Error ? error.message : error,
    );

    return null;
  }
}

export async function fetchLinkFunds(codes: string[]) {
  const results = await Promise.all(
    codes.map((code) => fetchLinkFund(code.replace(".", ""), codes)),
  );

  return results.reduce(
    (acc, item) => {
      if (item) {
        return [...(acc || []), ...item];
      }
      return acc;
    },
    [] as Array<{
      target: string;
      source: string;
      scale: number;
      similar: number;
    }>,
  );
}
