import { BraveSearchAdapter } from "@/lib/providers/search/brave-adapter";
import { ExaSearchAdapter } from "@/lib/providers/search/exa-adapter";
import { PerplexitySearchAdapter } from "@/lib/providers/search/perplexity-search-adapter";
import { TavilySearchAdapter } from "@/lib/providers/search/tavily-adapter";
import { searchProviderNames, type SearchProviderName } from "@/lib/providers/search/capabilities";
import type { SearchProviderAdapter } from "@/lib/providers/search/types";

export function getSearchProviderAdapter(provider: SearchProviderName): SearchProviderAdapter {
  if (provider === "TAVILY") return new TavilySearchAdapter();
  if (provider === "BRAVE") return new BraveSearchAdapter();
  if (provider === "EXA") return new ExaSearchAdapter();
  if (provider === "PERPLEXITY_SEARCH") return new PerplexitySearchAdapter();
  return assertNever(provider);
}

export function isSearchProviderName(value: unknown): value is SearchProviderName {
  return typeof value === "string" && searchProviderNames.includes(value as SearchProviderName);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported search provider: ${String(value)}`);
}
