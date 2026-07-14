const trackingParams = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"]);

export function normalizeTrustedUrl(url: string) {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (trackingParams.has(key.toLowerCase())) parsed.searchParams.delete(key);
    }
    const sorted = Array.from(parsed.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    parsed.search = "";
    for (const [key, value] of sorted) parsed.searchParams.append(key, value);
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) parsed.pathname = parsed.pathname.slice(0, -1);
    return parsed.toString();
  } catch {
    return "";
  }
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function assertHttpUrl(url: string) {
  const normalized = normalizeTrustedUrl(url);
  if (!normalized) throw new Error("URL 不是有效 http/https 地址。");
  return normalized;
}
