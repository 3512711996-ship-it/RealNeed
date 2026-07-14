import { hostOf, normalizeTrustedUrl } from "@/lib/search/normalize-url";
import type { TrustedSearchResult } from "@/lib/search/search-types";

export function deduplicateTrustedResults(results: TrustedSearchResult[], options: { maxPerHost?: number; maxTotal?: number } = {}) {
  const maxPerHost = options.maxPerHost ?? 6;
  const maxTotal = options.maxTotal ?? 20;
  const seen = new Set<string>();
  const perHost = new Map<string, number>();
  const deduped: TrustedSearchResult[] = [];

  for (const result of results) {
    const normalizedUrl = normalizeTrustedUrl(result.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;
    const host = hostOf(normalizedUrl);
    const hostCount = perHost.get(host) ?? 0;
    if (hostCount >= maxPerHost) continue;
    seen.add(normalizedUrl);
    perHost.set(host, hostCount + 1);
    deduped.push({ ...result, normalizedUrl });
    if (deduped.length >= maxTotal) break;
  }

  return deduped;
}
