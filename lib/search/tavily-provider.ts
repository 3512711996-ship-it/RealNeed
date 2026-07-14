import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { recordApiUsage } from "@/lib/usage-tracker";
import { normalizeTrustedUrl } from "@/lib/search/normalize-url";
import type { ExtractRequest, ExtractResponse, SearchRequest, SearchResponse, TrustedSearchResult } from "@/lib/search/search-types";
import { SearchNotConfiguredError, SearchProviderApiError } from "@/lib/search/search-types";
import { getJobAbortSignal } from "@/lib/job-abort-context";

const TavilySearchSchema = z
  .object({
    request_id: z.string().optional().nullable(),
    results: z
      .array(
        z.object({
          title: z.string().optional().nullable(),
          url: z.string().optional().nullable(),
          content: z.string().optional().nullable(),
          score: z.number().optional().nullable()
        })
      )
      .optional()
      .default([]),
    usage: z
      .object({
        credits: z.number().optional().nullable()
      })
      .optional()
      .nullable()
  })
  .passthrough();

const TavilyExtractSchema = z
  .object({
    request_id: z.string().optional().nullable(),
    results: z
      .array(
        z
          .object({
            url: z.string().optional().nullable(),
            raw_content: z.string().optional().nullable(),
            content: z.string().optional().nullable(),
            title: z.string().optional().nullable()
          })
          .passthrough()
      )
      .optional()
      .default([]),
    failed_results: z
      .array(
        z
          .object({
            url: z.string().optional().nullable(),
            error: z.string().optional().nullable()
          })
          .passthrough()
      )
      .optional()
      .default([]),
    usage: z
      .object({
        credits: z.number().optional().nullable()
      })
      .optional()
      .nullable()
  })
  .passthrough();

const tavilyBaseUrl = "https://api.tavily.com";

/** @deprecated Runtime search uses lib/providers/search/tavily-adapter.ts. */
export class TavilyProvider {
  private readonly env = getServerEnv();

  async search(input: SearchRequest): Promise<SearchResponse> {
    if (!this.env.tavilyApiKey) throw new SearchNotConfiguredError("自动搜索尚未配置 Tavily API Key。");

    const startedAt = Date.now();
    let searchRequestId: string | null = null;

    try {
      const payload = await requestTavily(`${tavilyBaseUrl}/search`, this.env.tavilyApiKey, this.env.tavilyProjectId, input.sessionId, {
        query: input.query,
        search_depth: "basic",
        max_results: input.maxResults,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_usage: true
      });
      const parsed = TavilySearchSchema.parse(payload);
      const providerRequestId = parsed.request_id ?? null;
      const creditsUsed = parsed.usage?.credits ?? null;
      const durationMs = Date.now() - startedAt;
      searchRequestId = await saveSearchRequest({
        judgmentId: input.sessionId,
        providerRequestId,
        query: input.query,
        querySource: input.querySource,
        market: input.market,
        intent: input.intent,
        operation: "SEARCH",
        resultCount: parsed.results.length,
        creditsUsed,
        durationMs,
        success: true
      });

      await recordApiUsage({
        judgmentId: input.sessionId,
        provider: "tavily",
        operation: "search",
        requestCount: 1,
        creditsUsed: creditsUsed ?? undefined,
        durationMs,
        success: true,
        estimated: false
      });

      return {
        providerRequestId,
        creditsUsed,
        durationMs,
        searchRequestId,
        results: parsed.results
          .map((item, index): TrustedSearchResult | null => {
            if (!item.url) return null;
            const normalizedUrl = normalizeTrustedUrl(item.url);
            if (!normalizedUrl) return null;
            return {
              id: `${searchRequestId ?? providerRequestId ?? "tavily"}-${index + 1}`,
              title: cleanText(item.title ?? item.url),
              url: item.url,
              normalizedUrl,
              excerpt: cleanText(item.content ?? ""),
              score: item.score ?? null,
              provider: "TAVILY",
              providerRequestId,
              searchRequestId,
              origin: "SEARCH_PROVIDER",
              receivedAt: new Date().toISOString()
            };
          })
          .filter((item): item is TrustedSearchResult => Boolean(item))
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      await saveSearchRequest({
        judgmentId: input.sessionId,
        providerRequestId: null,
        query: input.query,
        querySource: input.querySource,
        market: input.market,
        intent: input.intent,
        operation: "SEARCH",
        resultCount: 0,
        creditsUsed: null,
        durationMs,
        success: false,
        errorCode: getErrorCode(error),
        errorMessage: error instanceof Error ? error.message : "Tavily search failed"
      });
      await recordApiUsage({
        judgmentId: input.sessionId,
        provider: "tavily",
        operation: "search",
        requestCount: 1,
        durationMs,
        success: false,
        errorCode: getErrorCode(error),
        estimated: false
      });
      throw error;
    }
  }

  async extract(input: ExtractRequest): Promise<ExtractResponse> {
    if (!this.env.tavilyApiKey) throw new SearchNotConfiguredError("自动搜索尚未配置 Tavily API Key。");

    const startedAt = Date.now();
    const urls = input.urls.filter(Boolean).slice(0, 5);

    if (urls.length === 0) {
      return {
        providerRequestId: null,
        creditsUsed: null,
        durationMs: null,
        searchRequestId: input.searchRequestId ?? null,
        results: []
      };
    }

    try {
      const payload = await requestTavily(`${tavilyBaseUrl}/extract`, this.env.tavilyApiKey, this.env.tavilyProjectId, input.sessionId, {
        urls,
        query: input.query,
        chunks_per_source: 3,
        extract_depth: "basic",
        include_usage: true
      });
      const parsed = TavilyExtractSchema.parse(payload);
      const providerRequestId = parsed.request_id ?? null;
      const creditsUsed = parsed.usage?.credits ?? null;
      const durationMs = Date.now() - startedAt;
      await saveSearchRequest({
        judgmentId: input.sessionId,
        providerRequestId,
        query: input.query,
        operation: "EXTRACT",
        resultCount: parsed.results.length,
        creditsUsed,
        durationMs,
        success: true
      });
      await recordApiUsage({
        judgmentId: input.sessionId,
        provider: "tavily",
        operation: "extract",
        requestCount: 1,
        creditsUsed: creditsUsed ?? undefined,
        durationMs,
        success: true,
        estimated: false
      });

      const failedByUrl = new Map(parsed.failed_results.map((item) => [item.url ?? "", item.error ?? "Tavily extract failed"]));
      const extracted = parsed.results.map((item) => {
        const url = item.url ?? "";
        const normalizedUrl = normalizeTrustedUrl(url);
        const rawContent = cleanText(item.raw_content ?? item.content ?? "");
        const quality = contentQuality(rawContent);
        return {
          url,
          normalizedUrl,
          rawContent,
          excerpt: rawContent.slice(0, 1200),
          title: item.title ?? undefined,
          provider: "TAVILY" as const,
          providerRequestId,
          searchRequestId: input.searchRequestId ?? null,
          evidenceAvailability: quality ? ("CONFIRMED_CONTENT" as const) : ("SEARCH_LEAD" as const),
          failureReason: quality ? undefined : "Tavily Extract returned too little analyzable text",
          receivedAt: new Date().toISOString()
        };
      });

      for (const [url, error] of failedByUrl) {
        const normalizedUrl = normalizeTrustedUrl(url);
        if (!normalizedUrl) continue;
        extracted.push({
          url,
          normalizedUrl,
          rawContent: "",
          excerpt: "",
          title: undefined,
          provider: "TAVILY",
          providerRequestId,
          searchRequestId: input.searchRequestId ?? null,
          evidenceAvailability: "SEARCH_LEAD",
          failureReason: error,
          receivedAt: new Date().toISOString()
        });
      }

      return {
        providerRequestId,
        creditsUsed,
        durationMs,
        searchRequestId: input.searchRequestId ?? null,
        results: extracted
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      await saveSearchRequest({
        judgmentId: input.sessionId,
        providerRequestId: null,
        query: input.query,
        operation: "EXTRACT",
        resultCount: 0,
        creditsUsed: null,
        durationMs,
        success: false,
        errorCode: getErrorCode(error),
        errorMessage: error instanceof Error ? error.message : "Tavily extract failed"
      });
      await recordApiUsage({
        judgmentId: input.sessionId,
        provider: "tavily",
        operation: "extract",
        requestCount: 1,
        durationMs,
        success: false,
        errorCode: getErrorCode(error),
        estimated: false
      });
      throw error;
    }
  }
}

async function requestTavily(url: string, apiKey: string, projectId: string | undefined, sessionId: string, body: unknown) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Session-Id": sessionId
  };
  if (projectId) headers["X-Project-ID"] = projectId;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: getJobAbortSignal()
  });

  if (!response.ok) {
    const text = await response.text();
    const message =
      response.status === 401 || response.status === 403
        ? "Tavily API Key 配置错误或无权限。"
        : response.status === 429
          ? "Tavily 搜索额度不足或触发限流。"
          : `Tavily 服务暂时失败：${response.status} ${text.slice(0, 160)}`;
    throw new SearchProviderApiError(response.status, message);
  }

  return response.json();
}

async function saveSearchRequest(input: {
  judgmentId: string;
  providerRequestId: string | null;
  query: string;
  querySource?: string;
  market?: string;
  intent?: string;
  operation: string;
  resultCount: number;
  creditsUsed: number | null;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}) {
  try {
    const record = await prisma.searchRequestRecord.create({
      data: {
        judgmentId: input.judgmentId,
        provider: "TAVILY",
        providerRequestId: input.providerRequestId,
        query: input.query,
        querySource: input.querySource,
        market: input.market,
        intent: input.intent,
        operation: input.operation,
        resultCount: input.resultCount,
        creditsUsed: input.creditsUsed,
        durationMs: input.durationMs,
        success: input.success,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage?.slice(0, 500)
      },
      select: { id: true }
    });
    return record.id;
  } catch {
    return null;
  }
}

function contentQuality(text: string) {
  const tokens = text.match(/[A-Za-z0-9]+|[\u4e00-\u9fff]{2,}/g) ?? [];
  return text.length >= 300 && tokens.length >= 40;
}

function getErrorCode(error: unknown) {
  if (error instanceof SearchProviderApiError) return error.code;
  if (error instanceof SearchNotConfiguredError) return "SEARCH_NOT_CONFIGURED";
  if (typeof error === "object" && error && "name" in error) return String((error as { name?: string }).name);
  return "TAVILY_ERROR";
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
