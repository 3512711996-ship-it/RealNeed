import { describe, expect, it } from "vitest";
import { mergeSourcePipelineFacts } from "../lib/judgment-engine";
import { scannedSourceToVerifiedSource } from "../lib/signal-extractor";
import { createPinnedAddressPool, verifySourcesConcurrently } from "../lib/source-verifier";
import type { PipelineStageMetrics, ScannedSource, SourceCandidate } from "../lib/types";

const publicUrl = "https://93.184.216.34/source";

describe("direct source verification", () => {
  it("does not invent HTTP 200 for extracted content that was not directly verified", () => {
    const source: ScannedSource = {
      id: "s1",
      title: "Extracted by provider",
      url: "https://example.com/source",
      platform: "tavily",
      query: "test",
      isAccessible: false,
      statusCode: null,
      verificationStatus: "UNVERIFIED",
      evidenceAvailability: "CONFIRMED_CONTENT",
      contentExtractionStatus: "CONTENT_EXTRACTED",
      extractedText: "Provider text exists, but no direct HTTP verification ran."
    };

    const verified = scannedSourceToVerifiedSource(source);
    expect(verified.statusCode).toBeNull();
    expect(verified.isAccessible).toBe(false);
    expect(verified.verificationStatus).toBe("UNVERIFIED");
  });

  it("keeps Tavily extraction separate from a blocked direct URL verification", () => {
    const normalizedUrl = "https://example.com/user-thread";
    const stage = completedStage();
    const sources = mergeSourcePipelineFacts({
      searchResults: [
        {
          id: "provider-1",
          title: "User thread",
          url: normalizedUrl,
          normalizedUrl,
          excerpt: "search excerpt",
          score: 0.9,
          provider: "TAVILY",
          providerRequestId: "request-1",
          searchRequestId: "search-1",
          origin: "SEARCH_PROVIDER",
          receivedAt: new Date().toISOString()
        }
      ],
      extractedByUrl: new Map([
        [
          normalizedUrl,
          {
            url: normalizedUrl,
            normalizedUrl,
            rawContent: readableText(),
            excerpt: readableText(),
            title: "User thread",
            provider: "TAVILY",
            providerRequestId: "extract-1",
            searchRequestId: "search-1",
            evidenceAvailability: "CONFIRMED_CONTENT",
            receivedAt: new Date().toISOString()
          }
        ]
      ]),
      extractionFailureByUrl: new Map(),
      directById: new Map([
        [
          "provider-1",
          {
            sourceId: "provider-1",
            requestedUrl: normalizedUrl,
            originalUrl: normalizedUrl,
            normalizedUrl,
            finalUrl: normalizedUrl,
            status: "BLOCKED",
            statusCode: 403,
            httpStatus: 403,
            platform: "example.com",
            contentType: "text/html",
            checkedAt: new Date().toISOString(),
            durationMs: 12,
            redirectCount: 0,
            errorCode: "BLOCKED",
            errorMessage: "HTTP 403",
            failureReason: "HTTP 403",
            verificationOrigin: "LIVE"
          }
        ]
      ]),
      searchStage: stage,
      extractionStage: stage
    });

    expect(sources[0]?.contentExtractionStatus).toBe("CONTENT_EXTRACTED");
    expect(sources[0]?.evidenceAvailability).toBe("CONFIRMED_CONTENT");
    expect(sources[0]?.verificationStatus).toBe("BLOCKED");
    expect(sources[0]?.statusCode).toBe(403);
    expect(sources[0]?.isAccessible).toBe(false);
  });

  it("uses Reddit's public JSON representation only after the post page is blocked", async () => {
    const candidate: SourceCandidate = {
      id: "reddit-post",
      title: "A Reddit post",
      url: "https://www.reddit.com/r/example/comments/abc123/a_post",
      platform: "reddit",
      query: "test"
    };
    const requests: string[] = [];
    const fetchImpl = (async (url: string) => {
      requests.push(url);
      if (!url.includes(".json")) return new Response("blocked", { status: 403 });
      return new Response(JSON.stringify([{ data: { children: [{ data: { title: "I hate this workflow", selftext: readableText() } }] } }]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    const result = await verifySourcesConcurrently([candidate], {
      fetchImpl,
      disableCache: true,
      concurrency: 1,
      perHostConcurrency: 1,
      timeoutMs: 1000,
      totalBudgetMs: 3000
    });
    const source = result.results[0];

    expect(source?.status).toBe("ACCESSIBLE");
    expect(source?.verificationOrigin).toBe("REDDIT_PUBLIC_JSON");
    expect(source?.finalUrl).toBe("https://www.reddit.com/r/example/comments/abc123/a_post");
    expect(source?.excerpt).toContain("concrete repeated workflow");
    expect(requests).toHaveLength(2);
  });

  it("uses verified page text, not a non-extract provider snippet, to confirm evidence", () => {
    const normalizedUrl = "https://example.com/brave-result";
    const stage = completedStage();
    const result = {
      id: "brave-1",
      title: "User thread",
      url: normalizedUrl,
      normalizedUrl,
      excerpt: "A promising search snippet that must remain a lead.",
      score: 0.9,
      provider: "BRAVE" as const,
      providerRequestId: null,
      searchRequestId: "search-1",
      origin: "SEARCH_PROVIDER" as const,
      receivedAt: new Date().toISOString()
    };
    const direct = {
      sourceId: "brave-1",
      requestedUrl: normalizedUrl,
      originalUrl: normalizedUrl,
      normalizedUrl,
      finalUrl: normalizedUrl,
      status: "ACCESSIBLE" as const,
      statusCode: 200,
      httpStatus: 200,
      title: "Verified user thread",
      platform: "example.com",
      contentType: "text/html",
      excerpt: readableText(),
      checkedAt: new Date().toISOString(),
      durationMs: 12,
      redirectCount: 0,
      errorCode: null,
      errorMessage: null,
      verificationOrigin: "LIVE" as const
    };

    const verified = mergeSourcePipelineFacts({
      searchResults: [result],
      extractedByUrl: new Map(),
      extractionFailureByUrl: new Map(),
      directById: new Map([[result.id, direct]]),
      searchStage: stage,
      extractionStage: stage
    })[0];

    expect(verified?.provider).toBe("BRAVE");
    expect(verified?.evidenceAvailability).toBe("CONFIRMED_CONTENT");
    expect(verified?.extractedText).toBe(readableText());

    const insufficient = mergeSourcePipelineFacts({
      searchResults: [result],
      extractedByUrl: new Map(),
      extractionFailureByUrl: new Map(),
      directById: new Map([[result.id, { ...direct, excerpt: "Too short." }]]),
      searchStage: stage,
      extractionStage: stage
    })[0];

    expect(insufficient?.evidenceAvailability).toBe("SEARCH_LEAD");
    expect(insufficient?.extractedText).toBe(result.excerpt);
  });

  it.each([
    [200, "ACCESSIBLE"],
    [403, "BLOCKED"],
    [429, "RATE_LIMITED"],
    [404, "NOT_FOUND"]
  ] as const)("maps HTTP %s to %s using a real direct response", async (status, expected) => {
    const result = await verifyOne(
      responseFetch(
        new Response(status === 200 ? readableText() : "request failed", {
          status,
          headers: { "content-type": "text/plain" }
        })
      )
    );

    expect(result.status).toBe(expected);
    expect(result.statusCode).toBe(status);
    expect(result.checkedAt).not.toBeNull();
    expect(typeof result.durationMs).toBe("number");
  });

  it("marks an allowed public redirect as redirected accessible", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(null, { status: 302, headers: { location: `${publicUrl}/final` } });
      }
      return new Response(readableText(), { status: 200, headers: { "content-type": "text/plain" } });
    }) as typeof fetch;

    const result = await verifyOne(fetchImpl);
    expect(result.status).toBe("REDIRECTED_ACCESSIBLE");
    expect(result.redirectCount).toBe(1);
    expect(result.statusCode).toBe(200);
  });

  it("blocks a redirect to a private network before the second request", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
    }) as typeof fetch;

    const result = await verifyOne(fetchImpl);
    expect(result.status).toBe("REDIRECT_BLOCKED");
    expect(result.statusCode).toBe(302);
    expect(calls).toBe(1);
  });

  it.each([
    "http://localhost/private",
    "http://127.0.0.1/private",
    "http://10.0.0.8/private",
    "http://[::1]/private",
    "http://169.254.169.254/latest/meta-data"
  ])("blocks redirect target %s before requesting it", async (target) => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(null, { status: 302, headers: { location: target } });
    }) as typeof fetch;

    const result = await verifyOne(fetchImpl);
    expect(result.status).toBe("REDIRECT_BLOCKED");
    expect(calls).toBe(1);
  });

  it("blocks a private target reached after multiple public redirects", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) return new Response(null, { status: 302, headers: { location: `${publicUrl}/hop-two` } });
      return new Response(null, { status: 302, headers: { location: "http://192.168.1.2/private" } });
    }) as typeof fetch;

    const result = await verifyOne(fetchImpl);
    expect(result.status).toBe("REDIRECT_BLOCKED");
    expect(result.redirectCount).toBe(2);
    expect(calls).toBe(2);
  });

  it("pins a copied public DNS address pool and rejects mixed private answers", () => {
    const resolved = [{ address: "93.184.216.34", family: 4 as const }];
    const pool = createPinnedAddressPool(resolved);
    resolved[0] = { address: "127.0.0.1", family: 4 };

    expect(pool.next()).toEqual({ address: "93.184.216.34", family: 4 });
    expect(() =>
      createPinnedAddressPool([
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.8", family: 4 }
      ])
    ).toThrow(/内网/);
  });

  it("rejects an oversized response before passing content downstream", async () => {
    const result = await verifyOne(
      responseFetch(
        new Response("small body", {
          status: 200,
          headers: { "content-type": "text/plain", "content-length": String(300 * 1024) }
        })
      )
    );

    expect(result.status).toBe("BODY_TOO_LARGE");
    expect(result.excerpt).toBeUndefined();
  });

  it("rejects unsupported binary content", async () => {
    const result = await verifyOne(
      responseFetch(new Response("binary", { status: 200, headers: { "content-type": "application/pdf" } }))
    );
    expect(result.status).toBe("UNSUPPORTED_CONTENT");
  });

  it("maps an aborted direct request to timeout", async () => {
    const fetchImpl = (async () => {
      throw new DOMException("request aborted", "AbortError");
    }) as typeof fetch;
    const result = await verifyOne(fetchImpl);
    expect(result.status).toBe("TIMEOUT");
    expect(result.statusCode).toBeNull();
  });

  it("stops a streamed body that exceeds the byte limit", async () => {
    const bytes = new Uint8Array(300 * 1024).fill(65);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      }
    });
    const result = await verifyOne(
      responseFetch(new Response(stream, { status: 200, headers: { "content-type": "text/plain" } }))
    );
    expect(result.status).toBe("BODY_TOO_LARGE");
  });

  it("records measured verification duration instead of a fixed placeholder", async () => {
    const fetchImpl = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 8));
      return new Response(readableText(), { status: 200, headers: { "content-type": "text/plain" } });
    }) as typeof fetch;

    const result = await verifyOne(fetchImpl);
    expect(result.durationMs).not.toBeNull();
    expect(result.durationMs as number).toBeGreaterThanOrEqual(5);
  });
});

async function verifyOne(fetchImpl: typeof fetch) {
  const candidate: SourceCandidate = {
    id: `source-${Date.now()}-${Math.random()}`,
    title: "Test source",
    url: `${publicUrl}?case=${Date.now()}-${Math.random()}`,
    platform: "test",
    query: "test"
  };
  const result = await verifySourcesConcurrently([candidate], {
    fetchImpl,
    disableCache: true,
    concurrency: 1,
    perHostConcurrency: 1,
    timeoutMs: 1000,
    totalBudgetMs: 3000
  });
  const first = result.results[0];
  if (!first) throw new Error("Verification did not return a result");
  return first;
}

function responseFetch(response: Response) {
  return (async () => response) as typeof fetch;
}

function readableText() {
  return "A real user explains a concrete repeated workflow problem and asks for a better tool. ".repeat(4);
}

function completedStage(): PipelineStageMetrics {
  const now = new Date().toISOString();
  return {
    startedAt: now,
    completedAt: now,
    durationMs: 1,
    attemptedCount: 1,
    succeededCount: 1,
    failedCount: 0,
    timeoutCount: 0,
    blockedCount: 0,
    rateLimitedCount: 0
  };
}
