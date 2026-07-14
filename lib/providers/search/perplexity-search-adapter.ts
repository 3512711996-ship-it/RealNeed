import { z } from "zod";
import { normalizeTrustedUrl } from "@/lib/search/normalize-url";
import { providerResponseInvalid } from "@/lib/providers/shared-errors";
import { requestSearchJson } from "@/lib/providers/search/request";
import type { NormalizedSearchResponse, SearchProviderAdapter } from "@/lib/providers/search/types";

const endpoint = "https://api.perplexity.ai/search";
const resultSchema = z.object({ title: z.string().nullish(), url: z.string(), snippet: z.string().nullish(), date: z.string().nullish(), last_updated: z.string().nullish() }).passthrough();
const schema = z.object({ id: z.string().nullish(), request_id: z.string().nullish(), results: z.array(resultSchema).default([]), data: z.array(resultSchema).optional() }).passthrough();

export class PerplexitySearchAdapter implements SearchProviderAdapter {
  readonly provider = "PERPLEXITY_SEARCH" as const;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  getCapabilities() {
    return { search: true, extract: false, regionFilter: false, languageFilter: false, dateFilter: true, usageReporting: false, providerRequestId: true, contentIncludedInSearch: false };
  }
  async testConnection(input: { apiKey: string; signal?: AbortSignal }) {
    const response = await this.search({ apiKey: input.apiKey, query: "product research", maxResults: 1, signal: input.signal, credentialSource: "USER_PROVIDED" });
    return { connected: true, provider: this.provider, providerRequestId: response.providerRequestId, durationMs: response.durationMs };
  }
  async search(input: Parameters<SearchProviderAdapter["search"]>[0]): Promise<NormalizedSearchResponse> {
    const startedAt = Date.now();
    const payload = await requestSearchJson({
      provider: this.provider, url: endpoint, credentialSource: input.credentialSource, fetchImpl: this.fetchImpl,
      init: { method: "POST", headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: input.query, max_results: input.maxResults }), signal: input.signal }
    });
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw providerResponseInvalid(this.provider, "SEARCH");
    const requestId = parsed.data.request_id ?? parsed.data.id ?? null;
    const receivedAt = new Date().toISOString();
    const results = parsed.data.results.length ? parsed.data.results : parsed.data.data ?? [];
    return {
      provider: this.provider, providerRequestId: requestId,
      results: results.filter((item) => Boolean(normalizeTrustedUrl(item.url))).map((item) => ({
        provider: this.provider, providerResultId: null, providerRequestId: requestId, title: clean(item.title ?? item.url), originalUrl: item.url,
        snippet: clean(item.snippet ?? "") || null, providerContent: null, publishedAt: item.date ?? item.last_updated ?? null, score: null, receivedAt
      })),
      usage: { requestCount: 1, creditsUsed: null, providerReportedCost: null }, durationMs: Date.now() - startedAt
    };
  }
}
function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
