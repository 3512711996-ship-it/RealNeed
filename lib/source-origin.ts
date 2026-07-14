import type { ScannedSource, SearchProviderRecord } from "@/lib/types";

export class UntrustedSourceOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UntrustedSourceOriginError";
  }
}

const trustedSearchProviders = new Set<SearchProviderRecord>(["TAVILY", "BRAVE", "EXA", "PERPLEXITY_SEARCH"]);

export function assertTrustedSourceOrigin(source: ScannedSource) {
  if (!source.origin) {
    throw new UntrustedSourceOriginError("来源缺少 origin，不能进入正式来源记录。");
  }

  if (source.origin === "SEARCH_PROVIDER") {
    if (!source.provider || !trustedSearchProviders.has(source.provider as SearchProviderRecord)) {
      throw new UntrustedSourceOriginError("搜索来源必须来自已接入的真实搜索供应商。");
    }
    if (!source.providerRequestId && !source.searchRequestId) {
      throw new UntrustedSourceOriginError("搜索来源缺少供应商请求记录，不能作为可信来源保存。");
    }
    if (!source.url || !/^https?:\/\//i.test(source.url)) {
      throw new UntrustedSourceOriginError("搜索来源必须包含真实 http/https URL。");
    }
  }

  if (source.origin === "USER_PASTED" && !(source.rawContent || source.extractedText)) {
    throw new UntrustedSourceOriginError("用户粘贴来源必须包含用户提供的正文内容。");
  }

  if (source.origin === "UNTRUSTED_LEGACY_SOURCE") {
    return;
  }
}
