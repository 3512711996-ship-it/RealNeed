import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { prisma } from "@/lib/prisma";
import { getJobAbortSignal } from "@/lib/job-abort-context";
import type { SourceCandidate, SourceVerificationStatus, VerificationCoverage, VerificationOrigin } from "@/lib/types";

export type VerifiedSource = {
  title: string;
  url: string;
  normalizedUrl?: string;
  finalUrl?: string | null;
  platform: string;
  statusCode: number | null;
  httpStatus?: number | null;
  contentType?: string | null;
  isAccessible: boolean;
  extractedText: string;
  excerpt?: string;
  failureReason?: string;
  verificationStatus?: SourceVerificationStatus;
  verificationOrigin?: VerificationOrigin;
  checkedAt?: string | null;
  durationMs?: number | null;
  redirectCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type SourceVerificationResult = {
  sourceId: string;
  requestedUrl: string;
  originalUrl: string;
  normalizedUrl: string;
  finalUrl: string | null;
  status: SourceVerificationStatus;
  statusCode: number | null;
  httpStatus: number | null;
  title?: string;
  platform: string;
  contentType: string | null;
  excerpt?: string;
  failureReason?: string;
  checkedAt: string | null;
  durationMs: number | null;
  redirectCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  verificationOrigin: VerificationOrigin;
};

export type VerificationProgress = VerificationCoverage & {
  latestResult?: SourceVerificationResult;
};

export type VerificationResult = {
  results: SourceVerificationResult[];
  coverage: VerificationCoverage;
};

export type VerifyOptions = {
  concurrency?: number;
  perHostConcurrency?: number;
  timeoutMs?: number;
  totalBudgetMs?: number;
  onProgress?: (progress: VerificationProgress) => void;
  fetchImpl?: typeof fetch;
  disableCache?: boolean;
};

type NormalizedCandidate = SourceCandidate & {
  originalUrl: string;
  normalizedUrl: string;
};

type VerificationMetrics = {
  cacheHitCount: number;
  networkRequestCount: number;
};

const defaultVerifyOptions = {
  concurrency: 6,
  perHostConcurrency: 2,
  timeoutMs: 3500,
  totalBudgetMs: 15000
};

const maxRedirects = 4;
const maxBytesToRead = 256 * 1024;
const maxExtractedTextLength = 7000;
const userAgent = "RealNeedBot/0.2 (+https://realneed.local; evidence verification)";
const trackingParams = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"]);

export async function verifySource(url: string): Promise<VerifiedSource> {
  const candidate: SourceCandidate = {
    id: "single-source",
    title: "",
    url,
    platform: inferPlatform(url),
    query: "single"
  };
  const result = await verifySourcesConcurrently([candidate], defaultVerifyOptions);
  const verification = result.results[0] ?? buildUnverifiedResult(candidate, normalizeSourceUrl(url), Date.now(), "Verification did not start");
  return sourceResultToVerifiedSource(verification);
}

export function normalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (trackingParams.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }

    const sortedParams = Array.from(parsed.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    parsed.search = "";
    for (const [key, value] of sortedParams) {
      parsed.searchParams.append(key, value);
    }

    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

export function deduplicateSources(sources: SourceCandidate[]): SourceCandidate[] {
  const seen = new Set<string>();
  const deduplicated: SourceCandidate[] = [];

  for (const source of sources) {
    const normalizedUrl = normalizeSourceUrl(source.url);
    const key = normalizedUrl || `invalid:${source.url.trim()}`;

    if (seen.has(key)) continue;

    seen.add(key);
    deduplicated.push({
      ...source,
      originalUrl: source.originalUrl ?? source.url,
      normalizedUrl,
      url: normalizedUrl || source.url
    });
  }

  return deduplicated;
}

export async function verifySourcesConcurrently(candidates: SourceCandidate[], options: VerifyOptions = {}): Promise<VerificationResult> {
  const config = {
    concurrency: clampInteger(options.concurrency, defaultVerifyOptions.concurrency, 1, 12),
    perHostConcurrency: clampInteger(options.perHostConcurrency, defaultVerifyOptions.perHostConcurrency, 1, 6),
    timeoutMs: clampInteger(options.timeoutMs, defaultVerifyOptions.timeoutMs, 1000, 15000),
    totalBudgetMs: clampInteger(options.totalBudgetMs, defaultVerifyOptions.totalBudgetMs, 3000, 60000)
  };

  const startedAt = Date.now();
  const deadline = startedAt + config.totalBudgetMs;
  const deduplicated = deduplicateSources(candidates).slice(0, candidates.length) as NormalizedCandidate[];
  const queue = [...deduplicated];
  const activeByHost = new Map<string, number>();
  const running = new Set<Promise<void>>();
  const results: SourceVerificationResult[] = [];
  const metrics: VerificationMetrics = { cacheHitCount: 0, networkRequestCount: 0 };
  const budgetController = new AbortController();
  const budgetTimer = setTimeout(() => budgetController.abort(), config.totalBudgetMs);

  const emitProgress = (latestResult?: SourceVerificationResult) => {
    options.onProgress?.({
      ...buildCoverage({
        totalCandidates: candidates.length,
        deduplicatedCandidates: deduplicated.length,
        results,
        startedAt,
        config,
        metrics,
        partial: Date.now() >= deadline || results.some((result) => result.status === "UNVERIFIED")
      }),
      latestResult
    });
  };

  const launch = (candidate: NormalizedCandidate) => {
    const host = hostKey(candidate.normalizedUrl || candidate.url);
    activeByHost.set(host, (activeByHost.get(host) ?? 0) + 1);

    const task = verifyCandidate(candidate, {
      timeoutMs: config.timeoutMs,
      deadline,
      budgetSignal: budgetController.signal,
      metrics,
      fetchImpl: options.fetchImpl,
      disableCache: options.disableCache ?? false
    })
      .then((result) => {
        results.push(result);
        emitProgress(result);
      })
      .finally(() => {
        activeByHost.set(host, Math.max(0, (activeByHost.get(host) ?? 1) - 1));
        running.delete(task);
      });

    running.add(task);
  };

  try {
    while ((queue.length > 0 || running.size > 0) && Date.now() < deadline) {
      let launched = false;

      while (running.size < config.concurrency && queue.length > 0 && Date.now() < deadline) {
        const index = queue.findIndex((candidate) => {
          const host = hostKey(candidate.normalizedUrl || candidate.url);
          return (activeByHost.get(host) ?? 0) < config.perHostConcurrency;
        });

        if (index === -1) break;

        const [candidate] = queue.splice(index, 1);
        launch(candidate);
        launched = true;
      }

      if (running.size === 0) break;
      if (!launched || running.size >= config.concurrency) {
        await Promise.race(running);
      }
    }

    if (queue.length > 0 || running.size > 0) {
      budgetController.abort();
    }

    if (running.size > 0) {
      await Promise.allSettled(Array.from(running));
    }

    for (const candidate of queue) {
      const result = buildUnverifiedResult(candidate, candidate.normalizedUrl, startedAt, "Verification budget exhausted before this source started");
      results.push(result);
      emitProgress(result);
    }
  } finally {
    clearTimeout(budgetTimer);
  }

  const coverage = buildCoverage({
    totalCandidates: candidates.length,
    deduplicatedCandidates: deduplicated.length,
    results,
    startedAt,
    config,
    metrics,
    partial: results.some((result) => result.status === "UNVERIFIED") || results.length < deduplicated.length
  });

  logVerificationPerformance(results, coverage);

  return { results: sortResultsByInput(results, deduplicated), coverage };
}

function sourceResultToVerifiedSource(result: SourceVerificationResult): VerifiedSource {
  return {
    title: result.title ?? safeHostname(result.finalUrl ?? result.normalizedUrl ?? result.originalUrl),
    url: result.originalUrl,
    normalizedUrl: result.normalizedUrl,
    finalUrl: result.finalUrl,
    platform: result.platform,
    statusCode: result.statusCode,
    httpStatus: result.httpStatus,
    contentType: result.contentType,
    isAccessible: result.status === "ACCESSIBLE" || result.status === "REDIRECTED_ACCESSIBLE",
    extractedText: result.excerpt ?? "",
    excerpt: result.excerpt,
    failureReason: result.failureReason,
    verificationStatus: result.status,
    verificationOrigin: result.verificationOrigin,
    checkedAt: result.checkedAt,
    durationMs: result.durationMs,
    redirectCount: result.redirectCount,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage
  };
}

async function verifyCandidate(
  candidate: NormalizedCandidate,
  context: {
    timeoutMs: number;
    deadline: number;
    budgetSignal: AbortSignal;
    metrics: VerificationMetrics;
    fetchImpl?: typeof fetch;
    disableCache: boolean;
  }
): Promise<SourceVerificationResult> {
  const startedAt = Date.now();
  const normalizedUrl = candidate.normalizedUrl || normalizeSourceUrl(candidate.url);

  if (!normalizedUrl) {
    return buildResult(candidate, {
      normalizedUrl: "",
      status: "INVALID_URL",
      failureReason: "URL 无效或不是 http/https",
      startedAt
    });
  }

  try {
    await assertSafeFetchUrl(normalizedUrl);
  } catch (error) {
    return buildResult(candidate, {
      normalizedUrl,
      status: "INVALID_URL",
      failureReason: error instanceof Error ? error.message : "URL 被 SSRF 防护拒绝",
      startedAt
    });
  }

  const cached = context.disableCache ? null : await readVerificationCache(candidate, normalizedUrl, startedAt);
  if (cached) {
    context.metrics.cacheHitCount += 1;
    return cached;
  }

  const sourceDeadline = Math.min(context.deadline, Date.now() + context.timeoutMs);
  const sourceContext = { ...context, deadline: sourceDeadline, budgetDeadline: context.deadline };
  const first = await verifyLive(candidate, normalizedUrl, sourceContext, startedAt);

  const redditFallback = await verifyRedditPublicJson(candidate, normalizedUrl, first, sourceContext, startedAt);
  if (redditFallback) {
    if (!context.disableCache) await writeVerificationCache(redditFallback);
    return redditFallback;
  }

  if (shouldRetry(first) && Date.now() < sourceDeadline) {
    const retry = await verifyLive(candidate, normalizedUrl, sourceContext, startedAt);
    if (!context.disableCache) await writeVerificationCache(retry);
    return retry;
  }

  if (!context.disableCache) await writeVerificationCache(first);
  return first;
}

async function verifyRedditPublicJson(
  candidate: NormalizedCandidate,
  normalizedUrl: string,
  first: SourceVerificationResult,
  context: {
    timeoutMs: number;
    deadline: number;
    budgetDeadline: number;
    budgetSignal: AbortSignal;
    metrics: VerificationMetrics;
    fetchImpl?: typeof fetch;
    disableCache: boolean;
  },
  startedAt: number
): Promise<SourceVerificationResult | null> {
  if (!shouldTryRedditPublicJson(first)) return null;

  const endpoint = redditPublicJsonEndpoint(normalizedUrl);
  if (!endpoint || Date.now() >= context.deadline || context.budgetSignal.aborted) return null;

  const verified = await verifyLive(candidate, endpoint, context, startedAt);
  if (verified.status !== "ACCESSIBLE" && verified.status !== "REDIRECTED_ACCESSIBLE") return null;
  if (!hasSufficientRedditJsonText(verified.excerpt)) return null;

  return {
    ...verified,
    normalizedUrl,
    // Preserve the post URL for users. The origin label reveals that its
    // public Reddit JSON representation, not a direct HTML page, was read.
    finalUrl: normalizedUrl,
    platform: "reddit",
    verificationOrigin: "REDDIT_PUBLIC_JSON"
  };
}

function shouldTryRedditPublicJson(result: SourceVerificationResult) {
  if (!["BLOCKED", "RATE_LIMITED", "NETWORK_ERROR", "TIMEOUT"].includes(result.status)) return false;
  return Boolean(redditPublicJsonEndpoint(result.normalizedUrl || result.originalUrl));
}

function redditPublicJsonEndpoint(url: string) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "reddit.com" || !/^\/r\/[^/]+\/comments\/[^/]+/i.test(parsed.pathname)) return "";

    parsed.hostname = "www.reddit.com";
    parsed.pathname = `${parsed.pathname.replace(/\.json$/i, "").replace(/\/$/, "")}.json`;
    parsed.search = "";
    parsed.searchParams.set("raw_json", "1");
    parsed.searchParams.set("limit", "20");
    return parsed.toString();
  } catch {
    return "";
  }
}

function hasSufficientRedditJsonText(value: string | undefined) {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text.length >= 180 && (text.match(/[A-Za-z0-9]+|[\u4e00-\u9fff]{2,}/g)?.length ?? 0) >= 24;
}

async function verifyLive(
  candidate: NormalizedCandidate,
  normalizedUrl: string,
  context: {
    timeoutMs: number;
    deadline: number;
    budgetDeadline: number;
    budgetSignal: AbortSignal;
    metrics: VerificationMetrics;
    fetchImpl?: typeof fetch;
    disableCache: boolean;
  },
  startedAt: number
): Promise<SourceVerificationResult> {
  let currentUrl = normalizedUrl;
  let redirectCount = 0;

  try {
    for (; redirectCount <= maxRedirects; redirectCount += 1) {
      if (Date.now() >= context.budgetDeadline || context.budgetSignal.aborted) {
        return buildUnverifiedResult(candidate, normalizedUrl, startedAt, "本次直接验证时间预算已耗尽", currentUrl, redirectCount);
      }

      if (Date.now() >= context.deadline) {
        return buildResult(candidate, {
          normalizedUrl,
          finalUrl: currentUrl,
          status: "TIMEOUT",
          failureReason: "单来源验证超时",
          startedAt,
          redirectCount
        });
      }

      await assertSafeFetchUrl(currentUrl);
      context.metrics.networkRequestCount += 1;
      const fetched = await fetchWithBudget(currentUrl, context);
      try {
        const response = fetched.response;
        const status = response.status;
        const finalUrl = response.url || currentUrl;

        try {
          await assertSafeFetchUrl(finalUrl);
        } catch (error) {
          await cancelBody(response);
          return buildResult(candidate, {
            normalizedUrl,
            finalUrl,
            status: "REDIRECT_BLOCKED",
            httpStatus: status,
            failureReason: error instanceof Error ? error.message : "重定向目标被 SSRF 防护拒绝",
            errorCode: "REDIRECT_BLOCKED",
            startedAt,
            redirectCount
          });
        }

        if (status >= 300 && status < 400) {
          const location = response.headers.get("location");

          if (!location) {
            await cancelBody(response);
            return buildResult(candidate, {
              normalizedUrl,
              finalUrl,
              status: "NETWORK_ERROR",
              httpStatus: status,
              failureReason: "重定向缺少 Location",
              startedAt,
              redirectCount
            });
          }

          const nextUrl = normalizeSourceUrl(new URL(location, currentUrl).toString());
          try {
            await assertSafeFetchUrl(nextUrl);
          } catch (error) {
            await cancelBody(response);
            return buildResult(candidate, {
              normalizedUrl,
              finalUrl: nextUrl || null,
              status: "REDIRECT_BLOCKED",
              httpStatus: status,
              failureReason: error instanceof Error ? error.message : "重定向目标被 SSRF 防护拒绝",
              errorCode: "REDIRECT_BLOCKED",
              startedAt,
              redirectCount: redirectCount + 1
            });
          }
          await cancelBody(response);
          currentUrl = nextUrl;
          continue;
        }

        return await responseToResult({ candidate, normalizedUrl, response, finalUrl, startedAt, redirectCount });
      } finally {
        await fetched.cleanup();
      }
    }

    return buildResult(candidate, {
      normalizedUrl,
      finalUrl: currentUrl,
      status: "NETWORK_ERROR",
      failureReason: "重定向次数过多",
      errorCode: "TOO_MANY_REDIRECTS",
      startedAt,
      redirectCount
    });
  } catch (error) {
    const isAbort = isAbortError(error);
    const budgetExhausted = Date.now() >= context.budgetDeadline || context.budgetSignal.aborted;

    if (budgetExhausted) {
      return buildUnverifiedResult(candidate, normalizedUrl, startedAt, "本次直接验证时间预算已耗尽", currentUrl, redirectCount);
    }

    return buildResult(candidate, {
      normalizedUrl,
      finalUrl: currentUrl,
      status: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
      failureReason: isAbort ? "单来源验证超时" : cleanErrorMessage(error),
      startedAt,
      redirectCount
    });
  }
}

async function responseToResult({
  candidate,
  normalizedUrl,
  response,
  finalUrl,
  startedAt,
  redirectCount
}: {
  candidate: NormalizedCandidate;
  normalizedUrl: string;
  response: Response;
  finalUrl: string;
  startedAt: number;
  redirectCount: number;
}): Promise<SourceVerificationResult> {
  const httpStatus = response.status;
  const contentType = response.headers.get("content-type") ?? "";
  const statusFromHttp = mapHttpStatus(httpStatus);

  if (statusFromHttp !== "ACCESSIBLE") {
    await cancelBody(response);
    return buildResult(candidate, {
      normalizedUrl,
      finalUrl,
      status: statusFromHttp,
      httpStatus,
      contentType,
      failureReason: `HTTP ${httpStatus}`,
      startedAt,
      redirectCount
    });
  }

  if (!isSupportedContentType(contentType, finalUrl)) {
    await cancelBody(response);
    return buildResult(candidate, {
      normalizedUrl,
      finalUrl,
      status: "UNSUPPORTED_CONTENT",
      httpStatus,
      contentType,
      failureReason: `不支持的内容类型：${contentType || "unknown"}`,
      startedAt,
      redirectCount
    });
  }

  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytesToRead && response.status !== 206) {
    await cancelBody(response);
    return buildResult(candidate, {
      normalizedUrl,
      finalUrl,
      status: "BODY_TOO_LARGE",
      httpStatus,
      contentType,
      failureReason: `响应体超过 ${maxBytesToRead} 字节限制`,
      errorCode: "BODY_TOO_LARGE",
      startedAt,
      redirectCount
    });
  }

  const limited = await readLimitedText(response);
  if (limited.exceeded) {
    return buildResult(candidate, {
      normalizedUrl,
      finalUrl,
      status: "BODY_TOO_LARGE",
      httpStatus,
      contentType,
      failureReason: `响应体超过 ${maxBytesToRead} 字节限制`,
      errorCode: "BODY_TOO_LARGE",
      startedAt,
      redirectCount
    });
  }

  const parsed = parseContent(limited.text, contentType, finalUrl);
  const invalidReason = detectInvalidPage({ url: finalUrl, title: parsed.title, extractedText: parsed.extractedText });

  if (invalidReason) {
    return buildResult(candidate, {
      normalizedUrl,
      finalUrl,
      status: invalidReason.includes("not found") || invalidReason.includes("deleted") || invalidReason.includes("removed") ? "NOT_FOUND" : "BLOCKED",
      httpStatus,
      contentType,
      title: parsed.title,
      excerpt: parsed.extractedText,
      failureReason: invalidReason,
      startedAt,
      redirectCount
    });
  }

  if (parsed.extractedText.length < 60) {
    return buildResult(candidate, {
      normalizedUrl,
      finalUrl,
      status: "UNSUPPORTED_CONTENT",
      httpStatus,
      contentType,
      title: parsed.title,
      excerpt: parsed.extractedText,
      failureReason: "页面可读文本太少",
      startedAt,
      redirectCount
    });
  }

  return buildResult(candidate, {
    normalizedUrl,
    finalUrl,
    status: redirectCount > 0 ? "REDIRECTED_ACCESSIBLE" : "ACCESSIBLE",
    httpStatus,
    contentType,
    title: parsed.title || safeHostname(finalUrl),
    excerpt: parsed.extractedText,
    startedAt,
    redirectCount
  });
}

async function fetchWithBudget(
  url: string,
  context: {
    timeoutMs: number;
    deadline: number;
    budgetSignal: AbortSignal;
    fetchImpl?: typeof fetch;
  }
) {
  const remainingBudget = Math.max(1, context.deadline - Date.now());
  const timeoutMs = Math.min(context.timeoutMs, remainingBudget);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromBudget = () => controller.abort();
  const jobSignal = getJobAbortSignal();
  const abortFromJob = () => controller.abort(jobSignal?.reason);

  context.budgetSignal.addEventListener("abort", abortFromBudget, { once: true });
  jobSignal?.addEventListener("abort", abortFromJob, { once: true });
  if (jobSignal?.aborted) abortFromJob();

  try {
    if (context.fetchImpl) {
      const response = await context.fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: requestHeaders()
      });
      return { response, cleanup: async () => undefined };
    }

    const dispatcher = await createPinnedDispatcher(url, timeoutMs);
    try {
      const response = await undiciFetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: requestHeaders(),
        dispatcher
      });
      return {
        response: response as unknown as Response,
        cleanup: async () => {
          await dispatcher.close().catch(() => dispatcher.destroy());
        }
      };
    } catch (error) {
      dispatcher.destroy();
      throw error;
    }
  } finally {
    clearTimeout(timeout);
    context.budgetSignal.removeEventListener("abort", abortFromBudget);
    jobSignal?.removeEventListener("abort", abortFromJob);
  }
}

async function createPinnedDispatcher(url: string, timeoutMs: number) {
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await lookup(hostname, { all: true, verbatim: true });

  const addressPool = createPinnedAddressPool(
    addresses.map((address) => ({
      address: address.address,
      family: address.family === 6 ? 6 : 4
    }))
  );
  const pinnedLookup = ((
    _hostname: string,
    options: Parameters<LookupFunction>[1],
    callback: Parameters<LookupFunction>[2]
  ) => {
    const address = addressPool.next();
    if (typeof options === "object" && options && "all" in options && options.all) {
      callback(null, addressPool.all());
      return;
    }
    callback(null, address.address, address.family);
  }) as LookupFunction;

  return new Agent({
    connect: { lookup: pinnedLookup },
    connectTimeout: timeoutMs,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    maxResponseSize: maxBytesToRead + 1
  });
}

export function createPinnedAddressPool(addresses: Array<{ address: string; family: 4 | 6 }>) {
  const pinned = addresses.map((item) => ({ address: item.address, family: item.family }));
  if (pinned.length === 0) throw new Error("域名没有可用的公网地址");
  if (pinned.some((address) => isPrivateIp(address.address))) {
    throw new Error("禁止访问解析到内网的地址");
  }
  let cursor = 0;
  return {
    all: () => pinned.map((item) => ({ ...item })),
    next: () => {
      const address = pinned[cursor % pinned.length];
      cursor += 1;
      return { ...address };
    }
  };
}

function requestHeaders() {
  return {
    Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5",
    "Accept-Language": "en-US,en;q=0.8,zh-CN;q=0.7,zh;q=0.6",
    Range: `bytes=0-${maxBytesToRead - 1}`,
    "User-Agent": userAgent
  };
}

async function readLimitedText(response: Response) {
  if (!response.body) return { text: "", exceeded: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let exceeded = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;

      const remaining = maxBytesToRead - totalBytes;
      if (remaining <= 0 || value.byteLength > remaining) {
        exceeded = true;
        if (remaining <= 0) break;
      }
      const slice = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(slice);
      totalBytes += slice.byteLength;

      if (exceeded) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { text: new TextDecoder("utf-8", { fatal: false }).decode(combined), exceeded };
}

async function cancelBody(response: Response) {
  await response.body?.cancel().catch(() => undefined);
}

function buildResult(
  candidate: NormalizedCandidate,
  input: {
    normalizedUrl: string;
    status: SourceVerificationStatus;
    startedAt: number;
    finalUrl?: string | null;
    httpStatus?: number;
    contentType?: string;
    title?: string;
    excerpt?: string;
    failureReason?: string;
    verificationOrigin?: VerificationOrigin;
    checkedAt?: string | null;
    durationMs?: number | null;
    redirectCount?: number;
    errorCode?: string | null;
  }
): SourceVerificationResult {
  const errorCode = input.errorCode ?? (input.status === "ACCESSIBLE" || input.status === "REDIRECTED_ACCESSIBLE" ? null : input.status);
  return {
    sourceId: candidate.id,
    requestedUrl: candidate.originalUrl ?? candidate.url,
    originalUrl: candidate.originalUrl ?? candidate.url,
    normalizedUrl: input.normalizedUrl,
    finalUrl: input.finalUrl ?? null,
    status: input.status,
    statusCode: input.httpStatus ?? null,
    httpStatus: input.httpStatus ?? null,
    title: input.title || candidate.title || safeHostname(input.finalUrl ?? input.normalizedUrl ?? candidate.url),
    platform: candidate.platform || inferPlatform(input.finalUrl ?? input.normalizedUrl ?? candidate.url),
    contentType: input.contentType ?? null,
    excerpt: input.excerpt,
    failureReason: input.failureReason,
    checkedAt: input.checkedAt === undefined ? new Date().toISOString() : input.checkedAt,
    durationMs: input.durationMs === undefined ? Math.max(0, Date.now() - input.startedAt) : input.durationMs,
    redirectCount: input.redirectCount ?? 0,
    errorCode,
    errorMessage: input.failureReason ?? null,
    verificationOrigin: input.verificationOrigin ?? "LIVE"
  };
}

function buildUnverifiedResult(
  candidate: SourceCandidate,
  normalizedUrl: string,
  _startedAt: number,
  failureReason: string,
  finalUrl: string | null = null,
  redirectCount = 0
): SourceVerificationResult {
  const normalizedCandidate = {
    ...candidate,
    originalUrl: candidate.originalUrl ?? candidate.url,
    normalizedUrl
  } as NormalizedCandidate;

  return buildResult(normalizedCandidate, {
    normalizedUrl,
    finalUrl,
    status: "UNVERIFIED",
    failureReason,
    startedAt: 0,
    checkedAt: null,
    durationMs: null,
    redirectCount,
    errorCode: "UNVERIFIED"
  });
}

function buildCoverage({
  totalCandidates,
  deduplicatedCandidates,
  results,
  startedAt,
  config,
  metrics,
  partial
}: {
  totalCandidates: number;
  deduplicatedCandidates: number;
  results: SourceVerificationResult[];
  startedAt: number;
  config: typeof defaultVerifyOptions;
  metrics: VerificationMetrics;
  partial: boolean;
}): VerificationCoverage {
  const count = (status: SourceVerificationStatus) => results.filter((result) => result.status === status).length;
  const accessibleCount = count("ACCESSIBLE") + count("REDIRECTED_ACCESSIBLE");

  return {
    totalCandidates,
    deduplicatedCandidates,
    completedCount: results.filter((result) => result.status !== "UNVERIFIED").length,
    accessibleCount,
    blockedCount: count("BLOCKED"),
    rateLimitedCount: count("RATE_LIMITED"),
    notFoundCount: count("NOT_FOUND"),
    timeoutCount: count("TIMEOUT"),
    networkErrorCount: count("NETWORK_ERROR"),
    unsupportedContentCount: count("UNSUPPORTED_CONTENT") + count("BODY_TOO_LARGE"),
    invalidUrlCount: count("INVALID_URL"),
    unverifiedCount: count("UNVERIFIED") + Math.max(0, deduplicatedCandidates - results.length),
    cacheHitCount: metrics.cacheHitCount,
    networkRequestCount: metrics.networkRequestCount,
    concurrency: config.concurrency,
    perHostConcurrency: config.perHostConcurrency,
    timeoutMs: config.timeoutMs,
    totalBudgetMs: config.totalBudgetMs,
    durationMs: Math.max(0, Date.now() - startedAt),
    partial
  };
}

function sortResultsByInput(results: SourceVerificationResult[], candidates: NormalizedCandidate[]) {
  const index = new Map(candidates.map((candidate, order) => [candidate.id, order]));
  return [...results].sort((a, b) => (index.get(a.sourceId) ?? 0) - (index.get(b.sourceId) ?? 0));
}

function mapHttpStatus(status: number): SourceVerificationStatus {
  if (status >= 200 && status <= 299) return "ACCESSIBLE";
  if (status === 401 || status === 403) return "BLOCKED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 404 || status === 410) return "NOT_FOUND";
  if (status === 408) return "TIMEOUT";
  if (status >= 500 && status <= 599) return "NETWORK_ERROR";
  return "NETWORK_ERROR";
}

function shouldRetry(result: SourceVerificationResult) {
  if (result.status === "TIMEOUT") {
    return result.httpStatus === 408;
  }

  if (result.status === "RATE_LIMITED" || result.status === "NETWORK_ERROR") {
    if (result.httpStatus && ![408, 429, 500, 502, 503, 504].includes(result.httpStatus)) return false;
    return true;
  }

  return false;
}

async function readVerificationCache(candidate: NormalizedCandidate, normalizedUrl: string, startedAt: number): Promise<SourceVerificationResult | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const cached = await prisma.sourceVerificationCache.findUnique({
      where: { normalizedUrl }
    });

    if (!cached) return null;

    const status = cached.status as SourceVerificationStatus;
    const ttl = cacheTtlMs(status);
    const age = Date.now() - cached.checkedAt.getTime();

    if (ttl <= 0 || age > ttl) return null;

    return buildResult(candidate, {
      normalizedUrl,
      finalUrl: cached.finalUrl ?? undefined,
      status,
      httpStatus: cached.httpStatus ?? undefined,
      title: cached.title ?? undefined,
      contentType: cached.contentType ?? undefined,
      excerpt: cached.excerpt ?? undefined,
      failureReason: cached.failureReason ?? undefined,
      errorCode: cached.errorCode ?? undefined,
      redirectCount: cached.redirectCount,
      checkedAt: cached.checkedAt.toISOString(),
      durationMs: cached.durationMs,
      verificationOrigin: "CACHE",
      startedAt
    });
  } catch {
    return null;
  }
}

async function writeVerificationCache(result: SourceVerificationResult) {
  if (!process.env.DATABASE_URL) return;
  if (!result.normalizedUrl || result.status === "UNVERIFIED") return;

  try {
    await prisma.sourceVerificationCache.upsert({
      where: { normalizedUrl: result.normalizedUrl },
      create: {
        normalizedUrl: result.normalizedUrl,
        finalUrl: result.finalUrl,
        status: result.status,
        httpStatus: result.httpStatus,
        title: result.title,
        contentType: result.contentType,
        excerpt: result.excerpt,
        failureReason: result.failureReason,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        redirectCount: result.redirectCount,
        durationMs: result.durationMs,
        checkedAt: result.checkedAt ? new Date(result.checkedAt) : new Date()
      },
      update: {
        finalUrl: result.finalUrl,
        status: result.status,
        httpStatus: result.httpStatus,
        title: result.title,
        contentType: result.contentType,
        excerpt: result.excerpt,
        failureReason: result.failureReason,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        redirectCount: result.redirectCount,
        durationMs: result.durationMs,
        checkedAt: result.checkedAt ? new Date(result.checkedAt) : new Date()
      }
    });
  } catch {
    // Cache is an optimization only. Missing DATABASE_URL must not break verification.
  }
}

function cacheTtlMs(status: SourceVerificationStatus) {
  const minute = 60 * 1000;
  const hour = 60 * minute;

  if (status === "ACCESSIBLE" || status === "REDIRECTED_ACCESSIBLE") return 4 * hour;
  if (status === "NOT_FOUND") return 6 * hour;
  if (status === "BLOCKED") return hour;
  if (status === "RATE_LIMITED") return 10 * minute;
  if (status === "TIMEOUT" || status === "NETWORK_ERROR") return 15 * minute;
  if (status === "INVALID_URL" || status === "UNSUPPORTED_CONTENT" || status === "BODY_TOO_LARGE" || status === "REDIRECT_BLOCKED") return 6 * hour;
  return 0;
}

async function assertSafeFetchUrl(url: string) {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL 无效");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("只允许 http/https URL");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URL 中不能包含认证信息");
  }

  const hostname = parsed.hostname.toLowerCase();
  const trimmedHost = hostname.replace(/^\[|\]$/g, "");

  if (isBlockedHostname(trimmedHost)) {
    throw new Error("URL 被 SSRF 防护拒绝");
  }

  const literalIpVersion = isIP(trimmedHost);
  if (literalIpVersion && isPrivateIp(trimmedHost)) {
    throw new Error("禁止访问 localhost、内网或云元数据地址");
  }

  if (!literalIpVersion) {
    try {
      const addresses = await lookup(trimmedHost, { all: true, verbatim: false });
      if (addresses.some((address) => isPrivateIp(address.address))) {
        throw new Error("禁止访问解析到内网的地址");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("禁止访问")) throw error;
    }
  }
}

function isBlockedHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "metadata.google.internal" ||
    hostname === "metadata" ||
    hostname === "instance-data"
  );
}

function isPrivateIp(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  const parts = normalized.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function hostKey(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "__invalid__";
  }
}

function isSupportedContentType(contentType: string, finalUrl: string) {
  const normalized = contentType.toLowerCase();
  if (!normalized) return true;
  if (normalized.includes("text/html")) return true;
  if (normalized.includes("application/xhtml")) return true;
  if (normalized.includes("application/json")) return true;
  if (normalized.includes("text/plain")) return true;
  if (normalized.includes("text/markdown")) return true;
  if (normalized.includes("application/xml") || normalized.includes("text/xml")) return true;
  return finalUrl.endsWith(".json") || finalUrl.endsWith(".txt") || finalUrl.endsWith(".md");
}

function parseContent(rawText: string, contentType: string, finalUrl: string) {
  if (contentType.includes("application/json") || finalUrl.endsWith(".json")) {
    const reddit = parseRedditJson(rawText);
    if (reddit.extractedText) return reddit;
  }

  const title = extractTitle(rawText) || safeHostname(finalUrl);
  const extractedText = extractReadableText(rawText, contentType);
  return { title, extractedText };
}

function parseRedditJson(rawText: string) {
  try {
    const payload = JSON.parse(rawText) as unknown;
    const strings: string[] = [];
    collectStrings(payload, strings);
    const extractedText = strings
      .filter((value) => value.length > 12)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxExtractedTextLength);
    const title = strings.find((value) => value.length > 12 && value.length < 220) ?? "Reddit source";
    return { title, extractedText };
  } catch {
    return { title: "", extractedText: "" };
  }
}

function collectStrings(value: unknown, output: string[]) {
  if (typeof value === "string") {
    const clean = decodeHtml(value).replace(/\s+/g, " ").trim();
    if (clean) output.push(clean);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function inferPlatform(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

    if (hostname.includes("reddit.com")) return "reddit";
    if (hostname.includes("zhihu.com")) return "zhihu";
    if (hostname.includes("xiaohongshu.com")) return "xiaohongshu";
    if (hostname.includes("douyin.com")) return "douyin";
    if (hostname.includes("bilibili.com")) return "bilibili";
    if (hostname.includes("twitter.com") || hostname.includes("x.com")) return "x";

    return hostname;
  } catch {
    return "unknown";
  }
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1]).replace(/\s+/g, " ").trim().slice(0, 180) : "";
}

function extractReadableText(content: string, contentType: string) {
  const text = contentType.includes("text/plain") ? content : stripHtml(content);
  return decodeHtml(text).replace(/\s+/g, " ").trim().slice(0, maxExtractedTextLength);
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function detectInvalidPage({ url, title, extractedText }: { url: string; title: string; extractedText: string }) {
  const haystack = `${title} ${extractedText}`.toLowerCase();
  const genericInvalidSignals = [
    "404 not found",
    "page not found",
    "not found",
    "access denied",
    "forbidden",
    "this content is unavailable",
    "this page is unavailable",
    "this page has been deleted",
    "this page has been removed"
  ];

  const matchedGenericSignal = genericInvalidSignals.find((signal) => haystack.includes(signal));

  if (matchedGenericSignal) {
    return `Page appears invalid: ${matchedGenericSignal}`;
  }

  if (url.toLowerCase().includes("reddit.com")) {
    const redditInvalidSignals = [
      "this post was deleted",
      "this post has been removed",
      "this community is private",
      "you must be invited",
      "sorry, this post",
      "blocked by network security"
    ];
    const matchedRedditSignal = redditInvalidSignals.find((signal) => haystack.includes(signal));

    if (matchedRedditSignal) {
      return `Reddit page appears invalid: ${matchedRedditSignal}`;
    }
  }

  return undefined;
}

function cleanErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "网络请求失败";
  if (error.message.length > 180) return `${error.message.slice(0, 177)}...`;
  return error.message || "网络请求失败";
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function logVerificationPerformance(results: SourceVerificationResult[], coverage: VerificationCoverage) {
  if (process.env.NODE_ENV === "production") {
    console.info(
      `[source-verifier] candidates=${coverage.totalCandidates} deduped=${coverage.deduplicatedCandidates} completed=${coverage.completedCount} accessible=${coverage.accessibleCount} partial=${coverage.partial} durationMs=${coverage.durationMs}`
    );
    return;
  }

  console.info("[source-verifier]", {
    totalCandidates: coverage.totalCandidates,
    deduplicatedCandidates: coverage.deduplicatedCandidates,
    cacheHitCount: coverage.cacheHitCount,
    networkRequestCount: coverage.networkRequestCount,
    concurrency: coverage.concurrency,
    perHostConcurrency: coverage.perHostConcurrency,
    timeoutMs: coverage.timeoutMs,
    totalBudgetMs: coverage.totalBudgetMs,
    durationMs: coverage.durationMs,
    perSource: results.map((result) => ({
      sourceId: result.sourceId,
      host: hostKey(result.finalUrl ?? result.normalizedUrl),
      status: result.status,
      origin: result.verificationOrigin,
      durationMs: result.durationMs
    }))
  });
}
