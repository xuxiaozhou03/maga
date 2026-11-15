import type { ReportContext } from "./context.js";
import { ReportServiceError } from "./errors.js";

export interface ReportAiRequest {
  context: ReportContext;
  citationPaths: readonly string[];
  promptVersion: string;
  timeoutMs: number;
}

export interface ReportAiProvider {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  generate(request: ReportAiRequest): Promise<unknown>;
}

export interface OpenAiCompatibleProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  provider?: string;
  promptVersion?: string;
  maxOutputTokens?: number;
  fetch?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

export class OpenAiCompatibleReportProvider implements ReportAiProvider {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string;
  private readonly maxOutputTokens: number;

  constructor(options: OpenAiCompatibleProviderOptions) {
    if (options.apiKey.trim() === "") {
      throw new Error("AI API key must not be empty");
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.provider = options.provider ?? "openai-compatible";
    this.promptVersion = options.promptVersion ?? "report-v1";
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.maxOutputTokens = options.maxOutputTokens ?? 2_000;
  }

  async generate(request: ReportAiRequest): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: this.maxOutputTokens,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "你是 ETF 市场研究助理。只能解释提供的快照摘要，不得创建新数值事实。输出必须是 JSON 对象，包含 title、summary、sections、keyFindings。每个 section 的 citations 至少一条；citation.path 必须来自给定快照文件列表，field 必须是 RFC 6901 JSON Pointer。",
            },
            {
              role: "user",
              content: buildPrompt(request),
            },
          ],
        }),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new ReportServiceError({
        code: timedOut ? "REPORT_AI_FAILED" : "REPORT_AI_UNAVAILABLE",
        message: timedOut ? "AI report request timed out" : "AI report provider is unavailable",
        retryable: true,
        cause: error,
      });
    }

    if (!response.ok) {
      throw new ReportServiceError({
        code:
          response.status === 429 || response.status >= 500
            ? "REPORT_AI_FAILED"
            : "REPORT_AI_UNAVAILABLE",
        message: `AI report provider returned HTTP ${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
        context: { status: response.status },
      });
    }

    let payload: ChatCompletionResponse;
    try {
      payload = (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      throw new ReportServiceError({
        code: "REPORT_AI_INVALID_JSON",
        message: "AI report response was not valid JSON",
        retryable: true,
        cause: error,
      });
    }
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new ReportServiceError({
        code: "REPORT_AI_INVALID_JSON",
        message: "AI report response did not include message content",
        retryable: true,
      });
    }
    try {
      return JSON.parse(content) as unknown;
    } catch (error) {
      throw new ReportServiceError({
        code: "REPORT_AI_INVALID_JSON",
        message: "AI report message content was not valid JSON",
        retryable: true,
        cause: error,
      });
    }
  }
}

export function createReportAiProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ReportAiProvider | null {
  const apiKey = env.REPORT_AI_API_KEY ?? env.OPENAI_API_KEY;
  const model = env.REPORT_AI_MODEL ?? env.OPENAI_MODEL;
  if (!apiKey || !model) {
    return null;
  }
  const baseUrl = env.REPORT_AI_BASE_URL ?? env.OPENAI_BASE_URL;
  const maxOutputTokens = parsePositiveInteger(env.REPORT_AI_MAX_OUTPUT_TOKENS, 2_000);
  return new OpenAiCompatibleReportProvider({
    apiKey,
    model,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    provider: env.REPORT_AI_PROVIDER ?? "openai-compatible",
    promptVersion: env.REPORT_AI_PROMPT_VERSION ?? "report-v1",
    maxOutputTokens,
  });
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildPrompt(request: ReportAiRequest): string {
  return `生成一份中文 ETF 市场研究报告。\n\n快照上下文：\n${JSON.stringify(request.context, null, 2)}\n\n可引用快照文件（citation.path 只能取以下值）：\n${request.citationPaths.join("\n")}\n\n输出 JSON 结构：\n{\n  "title": "string",\n  "summary": "string",\n  "sections": [\n    { "heading": "string", "body": "string", "citations": [{ "path": "market/returns.json", "field": "/returns/20d/median" }] }\n  ],\n  "keyFindings": [{ "ruleCode": "string", "text": "string" }]\n}\n\n要求：\n1. 不得编造快照中不存在的数值。\n2. 每个 section 至少一条 citation。\n3. citation.field 必须是指向现有标量字段的 JSON Pointer。\n4. 缺失值写“—”，不得写成 0。\n5. 不给出买入、卖出、推荐或收益承诺。\n6. promptVersion=${request.promptVersion}。`;
}
