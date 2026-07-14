export type SourceOrigin = "SEARCH_PROVIDER" | "USER_PASTED" | "USER_URL" | "MANUAL_IMPORT";

export type EvidenceAvailability = "CONFIRMED_CONTENT" | "SEARCH_LEAD" | "NO_EVIDENCE";

export type SearchRequest = {
  query: string;
  maxResults: number;
  sessionId: string;
  querySource?: "KIMI_GENERAL" | "REDDIT_PAIN_REWRITE";
  market?: "DOMESTIC" | "OVERSEAS";
  intent?: "PAIN" | "WORKAROUND" | "PAYMENT" | "COMPETITOR";
};

export type ExtractRequest = {
  urls: string[];
  query: string;
  sessionId: string;
  searchRequestId?: string;
};

export type TrustedSearchResult = {
  id: string;
  title: string;
  url: string;
  normalizedUrl: string;
  excerpt: string;
  query?: string;
  score: number | null;
  provider: SearchProviderName;
  providerRequestId: string | null;
  searchRequestId: string | null;
  origin: "SEARCH_PROVIDER";
  receivedAt: string;
};

export type ExtractedContent = {
  url: string;
  normalizedUrl: string;
  rawContent: string;
  excerpt: string;
  title?: string;
  provider: SearchProviderName;
  providerRequestId: string | null;
  searchRequestId: string | null;
  evidenceAvailability: EvidenceAvailability;
  failureReason?: string;
  receivedAt: string;
};

export type SearchResponse = {
  results: TrustedSearchResult[];
  providerRequestId: string | null;
  creditsUsed: number | null;
  durationMs: number;
  searchRequestId: string | null;
};

export type ExtractResponse = {
  results: ExtractedContent[];
  providerRequestId: string | null;
  creditsUsed: number | null;
  durationMs: number | null;
  searchRequestId: string | null;
};

export interface SearchProvider {
  readonly provider: SearchProviderName;
  getCapabilities(): SearchProviderCapabilities;
  search(input: SearchRequest): Promise<SearchResponse>;
  extract(input: ExtractRequest): Promise<ExtractResponse>;
}

export class SearchNotConfiguredError extends Error {
  status = 424;

  constructor(message = "自动搜索尚未配置。") {
    super(message);
    this.name = "SearchNotConfiguredError";
  }
}

export class SearchProviderApiError extends Error {
  status: number;
  code: "SEARCH_AUTH_FAILED" | "SEARCH_RATE_LIMITED" | "SEARCH_PROVIDER_FAILED";

  constructor(status: number, message: string) {
    super(message);
    this.name = "SearchProviderApiError";
    this.status = status;
    this.code = status === 401 || status === 403 ? "SEARCH_AUTH_FAILED" : status === 429 ? "SEARCH_RATE_LIMITED" : "SEARCH_PROVIDER_FAILED";
  }
}
import type { SearchProviderName } from "@/lib/providers/search/capabilities";
import type { SearchProviderCapabilities } from "@/lib/providers/search/types";
