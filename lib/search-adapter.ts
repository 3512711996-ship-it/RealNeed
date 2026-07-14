import { createRuntimeSearchProvider } from "@/lib/search/search-provider";
import { SearchNotConfiguredError, SearchProviderApiError } from "@/lib/search/search-types";
import type { SearchAdapter, SearchResult } from "@/lib/types";

export class SearchUnavailableError extends Error {
  status = 424;

  constructor(message = "当前未配置 Tavily 真实搜索服务，请先使用手动粘贴模式，或配置 TAVILY_API_KEY。") {
    super(message);
    this.name = "SearchUnavailableError";
  }
}

export class SearchProviderError extends Error {
  status = 502;

  constructor(message: string) {
    super(message);
    this.name = "SearchProviderError";
  }
}

export function createSearchAdapter(sessionId = "legacy-search"): SearchAdapter {
  return {
    provider: "tavily",
    async search(query: string): Promise<SearchResult[]> {
      try {
        const provider = createRuntimeSearchProvider();
        const response = await provider.search({ query, maxResults: 5, sessionId });
        return response.results.map((result) => ({
          title: result.title,
          url: result.url,
          snippet: result.excerpt,
          platform: "tavily"
        }));
      } catch (error) {
        if (error instanceof SearchNotConfiguredError) throw new SearchUnavailableError(error.message);
        if (error instanceof SearchProviderApiError) throw new SearchProviderError(error.message);
        throw error;
      }
    }
  };
}
