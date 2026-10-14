import CryptoJS from "crypto-js";

const BASE_URL = "https://stock.cheesefortune.com";
const AES_KEY = "vGEZCiIXRIImAWSv";
const TOKEN_API = "/api/v2/system/apiOuth";

let cachedToken: string | null = null;

async function fetchApiToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const response = await fetch(`${BASE_URL}${TOKEN_API}`, {
    headers: { "Content-Type": "application/json;charset=utf-8" },
  });

  const data = (await response.json()) as { datas: string };

  cachedToken = data.datas;

  return cachedToken;
}
function splitToken(token: string, chunkSize = 8): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < token.length; i += chunkSize) {
    chunks.push(token.substring(i, i + chunkSize));
  }
  return chunks;
}

function aesEcbEncrypt(plaintext: string, key: string): string {
  const keyWordArray = CryptoJS.enc.Latin1.parse(key);
  const encrypted = CryptoJS.AES.encrypt(plaintext, keyWordArray, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  return encrypted.toString();
}

function md5(data: string): string {
  return CryptoJS.MD5(data).toString();
}

function generateZstokv1(apiToken: string, timestamp: number): string {
  const chunks = splitToken(apiToken, 8);
  const index = timestamp % 10;
  const block = chunks[index] ?? chunks[chunks.length - 1];
  const encryptedBlock = aesEcbEncrypt(block, AES_KEY);
  return md5(String(timestamp) + encryptedBlock);
}

async function buildHeaders(
  timestamp: number,
  referer: string,
): Promise<Record<string, string>> {
  const tokenResult = await fetchApiToken();

  const zstokv1 = generateZstokv1(tokenResult, timestamp);
  return {
    accept: "*/*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "app-version": "",
    "cache-control": "no-cache",
    "content-type": "application/json;charset=utf-8",
    devicetype: "ios",
    expires: "-1",
    pragma: "no-cache",
    requestfrom: "wechat",
    runtimetype: "unknown",
    "sec-ch-ua":
      '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"iOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    timestamp: String(timestamp),
    token: "",
    zstokv1,
    Referer: referer,
  };
}

export async function fetchCheeseApi<T>(options: {
  url: string;
  Referer: string;
  timestamp: number;
}) {
  let headers: Record<string, string>;
  try {
    headers = await buildHeaders(options.timestamp, options.Referer);
  } catch (error) {
    throw new Error(`获取请求头失败: ${error}`);
  }

  let data: any;
  try {
    const response = await fetch(options.url, {
      method: "GET",
      headers,
    });
    data = await response.json();
  } catch (error) {
    throw new Error(`网络请求失败: ${error}`);
  }

  if (!data || typeof data !== "object" || !("datas" in data)) {
    throw new Error(`响应数据格式错误: ${JSON.stringify(data)}`);
  }

  return data.datas as T;
}
