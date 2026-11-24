import { generateV4Timestamp, fetchCheeseApi } from "./fetchCheeseApi";

export interface LinkFund {
  target: string;
  source: string;
  similar: number;
}

export async function fetchLinkFund(
  code: string,
  codes: string[],
): Promise<LinkFund[]> {
  try {
    const timestamp = Date.now();
    const t = generateV4Timestamp(String(timestamp));

    const encodedCode = encodeURIComponent(code.replace(".", ""));

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
      ?.filter((item) => codes.includes(item.code) && item.similar > 80)
      ?.map((item) => ({
        target: code,
        source: item.code,
        similar: item.similar,
      }));
  } catch (error) {
    console.error(
      `[Cheese API] 获取关联基金失败: ${code}`,
      error instanceof Error ? error.message : error,
    );

    return [];
  }
}
