import CryptoJS from "crypto-js";

const BASE_URL = "https://stock.cheesefortune.com";
const AES_KEY = "vGEZCiIXRIImAWSv";
const TOKEN_API = "/api/v2/system/apiOuth";

const SUCCESS_CODES = ["000", "034"];

let cachedToken: string | null = null;

/**
 * 获取 API 认证 Token
 */
async function fetchApiToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken;
  }

  const response = await fetch(`${BASE_URL}${TOKEN_API}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
    },
  });

  if (!response.ok) {
    throw new Error(`获取 API Token 失败: HTTP ${response.status}`);
  }

  const result = (await response.json()) as {
    datas?: string;
  };

  if (!result.datas || typeof result.datas !== "string") {
    throw new Error(`获取 API Token 失败: ${JSON.stringify(result)}`);
  }

  cachedToken = result.datas;
  return cachedToken;
}

/**
 * Token 分块
 */
function splitToken(token: string, chunkSize = 8): string[] {
  const chunks: string[] = [];

  for (let i = 0; i < token.length; i += chunkSize) {
    chunks.push(token.slice(i, i + chunkSize));
  }

  return chunks;
}

/**
 * AES ECB 加密
 */
function aesEcbEncrypt(plaintext: string, key: string): string {
  return CryptoJS.AES.encrypt(plaintext, CryptoJS.enc.Latin1.parse(key), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();
}

/**
 * AES ECB 解密
 */
function aesEcbDecrypt(ciphertext: string, key: string): string {
  const decrypted = CryptoJS.AES.decrypt(
    ciphertext.replace(/\n/g, ""),
    CryptoJS.enc.Latin1.parse(key),
    {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    },
  );

  return decrypted.toString(CryptoJS.enc.Utf8);
}

/**
 * 生成 zstokv1
 */
function generateZstokv1(apiToken: string, timestamp: number): string {
  const chunks = splitToken(apiToken, 8);
  const block = chunks[timestamp % 10] ?? chunks[chunks.length - 1];

  if (!block) {
    throw new Error("API Token 分块失败");
  }

  const encrypted = aesEcbEncrypt(block, AES_KEY);

  return CryptoJS.MD5(`${timestamp}${encrypted}`).toString();
}

/**
 * 解密 API 响应数据
 */
function decryptApiData(encrypted: string): string | null {
  try {
    if (!encrypted || encrypted.length <= 16) {
      return null;
    }

    const keyPosition = Math.floor((encrypted.length - 16) / 2);
    const key = encrypted.slice(keyPosition, keyPosition + 16);

    const ciphertext =
      encrypted.slice(0, keyPosition) + encrypted.slice(keyPosition + 16);

    return aesEcbDecrypt(ciphertext, key) || null;
  } catch {
    return null;
  }
}

/**
 * 解析 API 响应
 */
async function parseApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  let result: any;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`API 响应不是有效 JSON: ${text.slice(0, 500)}`);
  }

  if (!result || typeof result !== "object" || !("datas" in result)) {
    throw new Error(`API 响应格式错误: ${JSON.stringify(result)}`);
  }

  if (result.rs === 1 && typeof result.datas === "string") {
    const decrypted = decryptApiData(result.datas);

    if (!decrypted) {
      throw new Error("API 响应 AES 解密失败");
    }

    try {
      result.datas = JSON.parse(decrypted);
    } catch {
      throw new Error(`API 解密后 JSON 解析失败: ${decrypted.slice(0, 300)}`);
    }
  }

  const code = String(result.code ?? "");

  if (!SUCCESS_CODES.includes(code)) {
    throw new Error(
      `API 业务请求失败: code=${code}, message=${result.message ?? "未知错误"}`,
    );
  }

  return result.datas as T;
}

/**
 * 构建请求头
 */
async function buildHeaders(
  timestamp: number,
): Promise<Record<string, string>> {
  const apiToken = await fetchApiToken();

  return {
    "Content-Type": "application/json;charset=utf-8",
    token: process.env.CHEESE_USER_TOKEN ?? "",
    requestFrom: "wechat",
    deviceType: process.env.CHEESE_DEVICE_TYPE ?? "unknown",
    runtimeType: process.env.CHEESE_RUNTIME_TYPE ?? "unknown",
    "app-version": process.env.CHEESE_APP_VERSION ?? "",
    Expires: "-1",
    zstokv1: generateZstokv1(apiToken, timestamp),
    timeStamp: String(timestamp),
  };
}

/**
 * 请求芝士财富 API
 *
 * timestamp 由调用方传入。
 * URL 完全由调用方负责，包括 v4 接口的 t 参数。
 */
export async function fetchCheeseApi<T>(options: {
  url: string;
  Referer: string;
  timestamp: number;
}): Promise<T> {
  const headers = await buildHeaders(options.timestamp);

  const response = await fetch(options.url, {
    method: "GET",
    headers: {
      ...headers,
      Referer: options.Referer,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP 请求失败: ${response.status} ${response.statusText}`);
  }

  return parseApiResponse<T>(response);
}
/**
 * 生成 v4 接口 t 参数
 *
 * 对应网页端 vd()
 */
export function generateV4Timestamp(timestamp: string): string {
  const targetDigit = timestamp[timestamp.length - 4];
  const lastDigit = timestamp[timestamp.length - 1];

  const position = lastDigit === "0" ? 2 : Number(lastDigit);

  return (
    timestamp.slice(0, position - 1) +
    targetDigit +
    timestamp.slice(position - 1)
  );
}
