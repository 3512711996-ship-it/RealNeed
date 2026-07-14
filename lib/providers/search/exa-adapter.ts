import { z } from "zod";
import { normalizeTrustedUrl } from "@/lib/search/normalize-url";
import { providerResponseInvalid } from "@/lib/providers/shared-errors";
import { requestSearchJson } from "@/lib/providers/search/request";
import type { NormalizedSearchResponse, SearchProviderAdapter } from "@/lib/providers/search/types";

const endpoint = "https://api.exa.ai/search";
const schema = z.object({
  requestId: z.string().nullish(),
  results: z.array(z.object({ id: z.string().nullish(), title: z.string().nullish(), url: z.string(), publishedDate: z.string().nullish(), score: z.number().nullish(), text: z.string().nullish(), highlights: z.array(z.string()).nullish() }).passthrough()).default([]),
  costDollars: z.object({ total: z.number().nullish() }).nullish()
}).passthrough();

export class ExaSearchAdapter implements SearchProviderAdapter {
  readonly provider = "EXA" as const;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  getCapabilities() {
    return { search: true, extract: false, regionFilter: false, languageFilter: false, dateFilter: true, usageReporting: true, providerRequestId: true, contentIncludedInSearch: false };
  }
  async testConnection(input: { apiKey: string; signal?: AbortSignal }) {
    const response = await this.search({ apiKey: input.apiKey, query: "product research", maxResults: 1, signal: input.signal, credentialSource: "USER_PROVIDED" });
    return { connected: true, provider: this.provider, providerRequestId: response.providerRequestId, durationMs: response.durationMs };
  }
  async search(input: Parameters<SearchProviderAdapter["search"]>[0]): Promise<NormalizedSearchResponse> {
    const startedAt = Date.now();
    const payload = await requestSearchJson({
      provider: this.provider, url: endpoint, credentialSource: input.credentialSource, fetchImpl: this.fetchImpl,
      init: { method: "POST", headers: { "x-api-key": input.apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ query: input.query, type: "auto", numResults: input.maxResults, contents: { highlights: { maxCharacters: 600 } } }), signal: input.signal }
    });
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw providerResponseInvalid(this.provider, "SEARCH");
    const requestId = parsed.data.requestId ?? null;
    const receivedAt = new Date().toISOString();
    return {
      provider: this.provider, providerRequestId: requestId,
      results: parsed.data.results.filter((item) => Boolean(normalizeTrustedUrl(item.url))).map((item) => ({
        provider: this.provider, providerResultId: item.id ?? null, providerRequestId: requestId, title: clean(item.title ?? item.url), originalUrl: item.url,
        snippet: clean(item.highlights?.join(" ") ?? item.text ?? "") || null, providerContent: null, publishedAt: item.publishedDate ?? null, score: item.score ?? null, receivedAt
      })),
      usage: { requestCount: 1, creditsUsed: null, providerReportedCost: parsed.data.costDollars?.total ?? null }, durationMs: Date.now() - startedAt
    };
  }
}
function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
