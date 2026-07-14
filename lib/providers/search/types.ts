import type { SearchProviderName } from "@/lib/providers/search/capabilities";

export type SearchProviderCapabilities = {
  search: boolean;
  extract: boolean;
  regionFilter: boolean;
  languageFilter: boolean;
  dateFilter: boolean;
  usageReporting: boolean;
  providerRequestId: boolean;
  contentIncludedInSearch: boolean;
};

export type SearchConnectionTestResult = {
  connected: boolean;
  provider: SearchProviderName;
  providerRequestId: string | null;
  durationMs: number;
};

export type NormalizedSearchResult = {
  provider: SearchProviderName;
  providerResultId: string | null;
  providerRequestId: string | null;
  title: string;
  originalUrl: string;
  snippet: string | null;
  providerContent: string | null;
  publishedAt: string | null;
  score: number | null;
  receivedAt: string;
};

export type NormalizedSearchResponse = {
  provider: SearchProviderName;
  providerRequestId: string | null;
  results: NormalizedSearchResult[];
  usage: {
    requestCount: number;
    creditsUsed: number | null;
    providerReportedCost: number | null;
  };
  durationMs: number;
};

export type NormalizedExtractResult = {
  provider: SearchProviderName;
  originalUrl: string;
  title: string | null;
  content: string;
  failureReason: string | null;
};

export type NormalizedExtractResponse = {
  provider: SearchProviderName;
  providerRequestId: string | null;
  results: NormalizedExtractResult[];
  usage: {
    requestCount: number;
    creditsUsed: number | null;
    providerReportedCost: number | null;
  };
  durationMs: number;
};

export interface SearchProviderAdapter {
  readonly provider: SearchProviderName;
  getCapabilities(): SearchProviderCapabilities;
  testConnection(input: { apiKey: string; signal?: AbortSignal }): Promise<SearchConnectionTestResult>;
  search(input: {
    apiKey: string;
    query: string;
    maxResults: number;
    market?: "DOMESTIC" | "OVERSEAS";
    language?: string;
    signal?: AbortSignal;
    credentialSource?: "PLATFORM" | "USER_PROVIDED";
  }): Promise<NormalizedSearchResponse>;
  extract?(input: {
    apiKey: string;
    urls: string[];
    query?: string;
    signal?: AbortSignal;
    credentialSource?: "PLATFORM" | "USER_PROVIDED";
  }): Promise<NormalizedExtractResponse>;
}
