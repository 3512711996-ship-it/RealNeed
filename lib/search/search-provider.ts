import type { Prisma } from "@prisma/client";
import { getJobAbortSignal } from "@/lib/job-abort-context";
import { buildProviderCallKey, withProviderCallCache } from "@/lib/provider-call-cache";
import { getProviderExecutionContext, releaseCredentialAfterCall, resolveSearchCredential } from "@/lib/provider-execution-context";
import { getSearchProviderAdapter } from "@/lib/providers/search/registry";
import type { NormalizedExtractResponse, NormalizedSearchResponse } from "@/lib/providers/search/types";
import { prisma } from "@/lib/prisma";
import { normalizeTrustedUrl } from "@/lib/search/normalize-url";
import type { ExtractRequest, ExtractResponse, ExtractedContent, SearchProvider, SearchRequest, SearchResponse, TrustedSearchResult } from "@/lib/search/search-types";
import { recordApiUsage } from "@/lib/usage-tracker";

export function createRuntimeSearchProvider(): SearchProvider {
  return new RuntimeSearchProvider();
}

class RuntimeSearchProvider implements SearchProvider {
  get provider() {
    return getProviderExecutionContext()?.search.provider ?? "TAVILY";
  }

  getCapabilities() {
    return getSearchProviderAdapter(this.provider).getCapabilities();
  }

  async search(input: SearchRequest): Promise<SearchResponse> {
    const resolved = await resolveSearchCredential();
    const adapter = getSearchProviderAdapter(resolved.config.provider);
    const callKey = buildProviderCallKey("search", { provider: resolved.config.provider, query: input.query, maxResults: input.maxResults, market: input.market });
    const startedAt = Date.now();
    try {
      const stored = await withProviderCallCache({
        callKey,
        provider: resolved.config.provider,
        providerType: "SEARCH",
        execute: async () => {
          const response = await adapter.search({
            apiKey: resolved.apiKey,
            query: input.query,
            maxResults: input.maxResults,
            market: input.market,
            signal: getJobAbortSignal(),
            credentialSource: resolved.config.credentialSource
          });
          const searchRequestId = await saveSearchRequest({
            judgmentId: input.sessionId,
            provider: resolved.config.provider,
            providerRequestId: response.providerRequestId,
            query: input.query,
            querySource: input.querySource,
            market: input.market,
            intent: input.intent,
            operation: "SEARCH",
            resultCount: response.results.length,
            creditsUsed: response.usage.creditsUsed,
            durationMs: response.durationMs,
            success: true
          });
          await recordSearchUsage(input.sessionId, resolved, response, "search", true);
          return { response, searchRequestId };
        }
      });
      return normalizeSearchResponse(stored.response, stored.searchRequestId, input.query);
    } catch (error) {
      await saveSearchRequest({ judgmentId: input.sessionId, provider: resolved.config.provider, providerRequestId: null, query: input.query, querySource: input.querySource, market: input.market, intent: input.intent, operation: "SEARCH", resultCount: 0, creditsUsed: null, durationMs: Date.now() - startedAt, success: false, errorCode: errorCode(error), errorMessage: safeErrorMessage(error) });
      await recordSearchFailure(input.sessionId, resolved, "search", Date.now() - startedAt, error);
      throw error;
    } finally {
      await releaseCredentialAfterCall(resolved.credentialId);
    }
  }

  async extract(input: ExtractRequest): Promise<ExtractResponse> {
    const resolved = await resolveSearchCredential();
    const adapter = getSearchProviderAdapter(resolved.config.provider);
    if (!adapter.extract) {
      await releaseCredentialAfterCall(resolved.credentialId);
      return { results: [], providerRequestId: null, creditsUsed: null, durationMs: null, searchRequestId: input.searchRequestId ?? null };
    }
    const callKey = buildProviderCallKey("extract", { provider: resolved.config.provider, urls: input.urls, query: input.query });
    const startedAt = Date.now();
    try {
      const stored = await withProviderCallCache({
        callKey,
        provider: resolved.config.provider,
        providerType: "SEARCH",
        execute: async () => {
          const response = await adapter.extract!({ apiKey: resolved.apiKey, urls: input.urls, query: input.query, signal: getJobAbortSignal(), credentialSource: resolved.config.credentialSource });
          await saveSearchRequest({ judgmentId: input.sessionId, provider: resolved.config.provider, providerRequestId: response.providerRequestId, query: input.query, operation: "EXTRACT", resultCount: response.results.length, creditsUsed: response.usage.creditsUsed, durationMs: response.durationMs, success: true });
          await recordSearchUsage(input.sessionId, resolved, response, "extract", true);
          return response;
        }
      });
      return normalizeExtractResponse(stored, input.searchRequestId ?? null);
    } catch (error) {
      await saveSearchRequest({ judgmentId: input.sessionId, provider: resolved.config.provider, providerRequestId: null, query: input.query, operation: "EXTRACT", resultCount: 0, creditsUsed: null, durationMs: Date.now() - startedAt, success: false, errorCode: errorCode(error), errorMessage: safeErrorMessage(error) });
      await recordSearchFailure(input.sessionId, resolved, "extract", Date.now() - startedAt, error);
      throw error;
    } finally {
      await releaseCredentialAfterCall(resolved.credentialId);
    }
  }
}

function normalizeSearchResponse(response: NormalizedSearchResponse, searchRequestId: string | null, query: string): SearchResponse {
  return {
    providerRequestId: response.providerRequestId,
    creditsUsed: response.usage.creditsUsed,
    durationMs: response.durationMs,
    searchRequestId,
    results: response.results.map((item, index): TrustedSearchResult | null => {
      const normalizedUrl = normalizeTrustedUrl(item.originalUrl);
      if (!normalizedUrl) return null;
      return {
        id: `${searchRequestId ?? response.providerRequestId ?? response.provider}-${index + 1}`,
        title: item.title,
        url: item.originalUrl,
        normalizedUrl,
        excerpt: item.snippet ?? "",
        query,
        score: item.score,
        provider: response.provider,
        providerRequestId: item.providerRequestId ?? response.providerRequestId,
        searchRequestId,
        origin: "SEARCH_PROVIDER",
        receivedAt: item.receivedAt
      };
    }).filter((item): item is TrustedSearchResult => Boolean(item))
  };
}

function normalizeExtractResponse(response: NormalizedExtractResponse, searchRequestId: string | null): ExtractResponse {
  const results: ExtractedContent[] = response.results.map((item) => {
    const normalizedUrl = normalizeTrustedUrl(item.originalUrl);
    const content = item.content.replace(/\s+/g, " ").trim();
    const confirmed = isContentQualitySufficient(content);
    return {
      url: item.originalUrl,
      normalizedUrl,
      rawContent: content,
      excerpt: content.slice(0, 1200),
      title: item.title ?? undefined,
      provider: response.provider,
      providerRequestId: response.providerRequestId,
      searchRequestId,
      evidenceAvailability: confirmed ? "CONFIRMED_CONTENT" : "SEARCH_LEAD",
      failureReason: item.failureReason ?? (confirmed ? undefined : "Provider extraction returned too little analyzable text"),
      receivedAt: new Date().toISOString()
    };
  });
  return { results, providerRequestId: response.providerRequestId, creditsUsed: response.usage.creditsUsed, durationMs: response.durationMs, searchRequestId };
}

function isContentQualitySufficient(content: string) {
  return content.length >= 300 && (content.match(/[A-Za-z0-9]+|[\u4e00-\u9fff]{2,}/g)?.length ?? 0) >= 40;
}

async function recordSearchUsage(judgmentId: string, resolved: Awaited<ReturnType<typeof resolveSearchCredential>>, response: NormalizedSearchResponse | NormalizedExtractResponse, operation: string, success: boolean) {
  await recordApiUsage({ judgmentId, provider: resolved.config.provider, providerType: "SEARCH", credentialSource: resolved.config.credentialSource, credentialId: resolved.credentialId, operation, requestCount: response.usage.requestCount, creditsUsed: response.usage.creditsUsed ?? undefined, durationMs: response.durationMs, success, estimated: false });
}

async function recordSearchFailure(judgmentId: string, resolved: Awaited<ReturnType<typeof resolveSearchCredential>>, operation: string, durationMs: number, error: unknown) {
  await recordApiUsage({ judgmentId, provider: resolved.config.provider, providerType: "SEARCH", credentialSource: resolved.config.credentialSource, credentialId: resolved.credentialId, operation, requestCount: 1, durationMs, success: false, errorCode: errorCode(error), estimated: false });
}

async function saveSearchRequest(input: { judgmentId: string; provider: string; providerRequestId: string | null; query: string; querySource?: string; market?: string; intent?: string; operation: string; resultCount: number; creditsUsed: number | null; durationMs: number; success: boolean; errorCode?: string; errorMessage?: string }) {
  try {
    const record = await prisma.searchRequestRecord.create({ data: { judgmentId: input.judgmentId, provider: input.provider, providerRequestId: input.providerRequestId, query: input.query, querySource: input.querySource, market: input.market, intent: input.intent, operation: input.operation, resultCount: input.resultCount, creditsUsed: input.creditsUsed as unknown as Prisma.Decimal, durationMs: input.durationMs, success: input.success, errorCode: input.errorCode, errorMessage: input.errorMessage?.slice(0, 500) }, select: { id: true } });
    return record.id;
  } catch { return null; }
}

function errorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "SEARCH_PROVIDER_FAILED") : "SEARCH_PROVIDER_FAILED";
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : "搜索供应商调用失败";
}
