import { z } from "zod";
import { normalizeTrustedUrl } from "@/lib/search/normalize-url";
import { providerResponseInvalid } from "@/lib/providers/shared-errors";
import { requestSearchJson } from "@/lib/providers/search/request";
import type { NormalizedExtractResponse, NormalizedExtractResult, NormalizedSearchResponse, SearchProviderAdapter } from "@/lib/providers/search/types";

const endpoint = "https://api.tavily.com";
const searchSchema = z.object({
  request_id: z.string().nullish(),
  results: z.array(z.object({ title: z.string().nullish(), url: z.string(), content: z.string().nullish(), score: z.number().nullish() })).default([]),
  usage: z.object({ credits: z.number().nullish() }).nullish()
}).passthrough();
const extractSchema = z.object({
  request_id: z.string().nullish(),
  results: z.array(z.object({ url: z.string(), raw_content: z.string().nullish(), content: z.string().nullish(), title: z.string().nullish() }).passthrough()).default([]),
  failed_results: z.array(z.object({ url: z.string().nullish(), error: z.string().nullish() }).passthrough()).default([]),
  usage: z.object({ credits: z.number().nullish() }).nullish()
}).passthrough();

export class TavilySearchAdapter implements SearchProviderAdapter {
  readonly provider = "TAVILY" as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  getCapabilities() {
    return { search: true, extract: true, regionFilter: false, languageFilter: false, dateFilter: true, usageReporting: true, providerRequestId: true, contentIncludedInSearch: false };
  }

  async testConnection(input: { apiKey: string; signal?: AbortSignal }) {
    const response = await this.search({ apiKey: input.apiKey, query: "product research", maxResults: 1, signal: input.signal, credentialSource: "USER_PROVIDED" });
    return { connected: true, provider: this.provider, providerRequestId: response.providerRequestId, durationMs: response.durationMs };
  }

  async search(input: Parameters<SearchProviderAdapter["search"]>[0]): Promise<NormalizedSearchResponse> {
    const startedAt = Date.now();
    const payload = await requestSearchJson({
      provider: this.provider,
      url: `${endpoint}/search`,
      credentialSource: input.credentialSource,
      fetchImpl: this.fetchImpl,
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: input.query, search_depth: "basic", max_results: input.maxResults, include_answer: false, include_raw_content: false, include_images: false, include_usage: true }),
        signal: input.signal
      }
    });
    const parsed = searchSchema.safeParse(payload);
    if (!parsed.success) throw providerResponseInvalid(this.provider, "SEARCH");
    const requestId = parsed.data.request_id ?? null;
    const receivedAt = new Date().toISOString();
    return {
      provider: this.provider,
      providerRequestId: requestId,
      results: parsed.data.results.filter((item) => Boolean(normalizeTrustedUrl(item.url))).map((item) => ({
        provider: this.provider,
        providerResultId: null,
        providerRequestId: requestId,
        title: clean(item.title ?? item.url),
        originalUrl: item.url,
        snippet: clean(item.content ?? "") || null,
        providerContent: null,
        publishedAt: null,
        score: item.score ?? null,
        receivedAt
      })),
      usage: { requestCount: 1, creditsUsed: parsed.data.usage?.credits ?? null, providerReportedCost: null },
      durationMs: Date.now() - startedAt
    };
  }

  async extract(input: Parameters<NonNullable<SearchProviderAdapter["extract"]>>[0]): Promise<NormalizedExtractResponse> {
    const startedAt = Date.now();
    const urls = input.urls.filter((url) => Boolean(normalizeTrustedUrl(url))).slice(0, 5);
    const payload = await requestSearchJson({
      provider: this.provider,
      url: `${endpoint}/extract`,
      credentialSource: input.credentialSource,
      fetchImpl: this.fetchImpl,
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ urls, query: input.query, chunks_per_source: 3, extract_depth: "basic", include_usage: true }),
        signal: input.signal
      }
    });
    const parsed = extractSchema.safeParse(payload);
    if (!parsed.success) throw providerResponseInvalid(this.provider, "SEARCH");
    const failed = new Map(parsed.data.failed_results.map((item) => [item.url ?? "", clean(item.error ?? "正文提取失败") || "正文提取失败"]));
    const results: NormalizedExtractResult[] = parsed.data.results.map((item) => ({
      provider: this.provider,
      originalUrl: item.url,
      title: item.title ?? null,
      content: clean(item.raw_content ?? item.content ?? ""),
      failureReason: null
    }));
    for (const [url, reason] of failed) {
      if (url && !results.some((item) => item.originalUrl === url)) results.push({ provider: this.provider, originalUrl: url, title: null, content: "", failureReason: reason });
    }
    return {
      provider: this.provider,
      providerRequestId: parsed.data.request_id ?? null,
      results,
      usage: { requestCount: 1, creditsUsed: parsed.data.usage?.credits ?? null, providerReportedCost: null },
      durationMs: Date.now() - startedAt
    };
  }
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
