import { z } from "zod";
import { normalizeTrustedUrl } from "@/lib/search/normalize-url";
import { providerResponseInvalid } from "@/lib/providers/shared-errors";
import { requestSearchJson } from "@/lib/providers/search/request";
import type { NormalizedSearchResponse, SearchProviderAdapter } from "@/lib/providers/search/types";

const endpoint = "https://api.search.brave.com/res/v1/web/search";
const schema = z.object({
  web: z.object({ results: z.array(z.object({ title: z.string(), url: z.string(), description: z.string().nullish(), age: z.string().nullish(), page_age: z.string().nullish() }).passthrough()).default([]) }).nullish()
}).passthrough();

export class BraveSearchAdapter implements SearchProviderAdapter {
  readonly provider = "BRAVE" as const;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  getCapabilities() {
    return { search: true, extract: false, regionFilter: true, languageFilter: true, dateFilter: true, usageReporting: false, providerRequestId: false, contentIncludedInSearch: false };
  }
  async testConnection(input: { apiKey: string; signal?: AbortSignal }) {
    const response = await this.search({ apiKey: input.apiKey, query: "product research", maxResults: 1, signal: input.signal, credentialSource: "USER_PROVIDED" });
    return { connected: true, provider: this.provider, providerRequestId: response.providerRequestId, durationMs: response.durationMs };
  }
  async search(input: Parameters<SearchProviderAdapter["search"]>[0]): Promise<NormalizedSearchResponse> {
    const startedAt = Date.now();
    const url = new URL(endpoint);
    url.searchParams.set("q", input.query);
    url.searchParams.set("count", String(Math.min(20, Math.max(1, input.maxResults))));
    if (input.language) url.searchParams.set("search_lang", input.language);
    if (input.market === "DOMESTIC") url.searchParams.set("country", "CN");
    const payload = await requestSearchJson({
      provider: this.provider,
      url: url.toString(),
      credentialSource: input.credentialSource,
      fetchImpl: this.fetchImpl,
      init: { method: "GET", headers: { Accept: "application/json", "X-Subscription-Token": input.apiKey }, signal: input.signal }
    });
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw providerResponseInvalid(this.provider, "SEARCH");
    const receivedAt = new Date().toISOString();
    return {
      provider: this.provider,
      providerRequestId: null,
      results: (parsed.data.web?.results ?? []).filter((item) => Boolean(normalizeTrustedUrl(item.url))).map((item) => ({
        provider: this.provider, providerResultId: null, providerRequestId: null, title: clean(item.title), originalUrl: item.url,
        snippet: clean(item.description ?? "") || null, providerContent: null, publishedAt: item.page_age ?? item.age ?? null, score: null, receivedAt
      })),
      usage: { requestCount: 1, creditsUsed: null, providerReportedCost: null },
      durationMs: Date.now() - startedAt
    };
  }
}
function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
