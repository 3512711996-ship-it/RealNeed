export const searchProviderNames = ["TAVILY", "BRAVE", "EXA", "PERPLEXITY_SEARCH"] as const;
export type SearchProviderName = (typeof searchProviderNames)[number];

export const searchProviderLabels: Record<SearchProviderName, string> = {
  TAVILY: "Tavily",
  BRAVE: "Brave Search",
  EXA: "Exa",
  PERPLEXITY_SEARCH: "Perplexity Search"
};
