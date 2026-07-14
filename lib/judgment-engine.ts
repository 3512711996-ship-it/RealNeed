import { generateOpportunities } from "@/lib/opportunity-generator";
import { interpretIdea } from "@/lib/idea-interpreter";
import { generateSearchQueryPlan, type SearchQueryPlanItem } from "@/lib/query-generator";
import { buildRedditResearchPlan } from "@/lib/reddit-research-engine";
import { ManualPasteAdapter } from "@/lib/manual-paste-adapter";
import { extractDemandSignals } from "@/lib/signal-extractor";
import { getServerEnv } from "@/lib/env";
import { createRuntimeSearchProvider } from "@/lib/search/search-provider";
import { deduplicateTrustedResults } from "@/lib/search/deduplicate-results";
import { normalizeTrustedUrl } from "@/lib/search/normalize-url";
import { SearchNotConfiguredError, SearchProviderApiError, type ExtractedContent, type TrustedSearchResult } from "@/lib/search/search-types";
import { verifySourcesConcurrently, type SourceVerificationResult, type VerificationProgress } from "@/lib/source-verifier";
import { enrichJudgmentTrust, enrichSourceRecord } from "@/lib/trust-analysis";
import { generateTodayAction } from "@/lib/generators/today-action-generator";
import type { SearchProviderName } from "@/lib/providers/search/capabilities";
import type { ApiUsageContext } from "@/lib/usage-tracker";
import type {
  AnalyzeRequest,
  ClarificationResponse,
  EvidenceSource,
  IdeaJudgment,
  InterpretedIdea,
  JudgmentScore,
  Opportunity,
  ProductOpportunity,
  PipelineStageMetrics,
  ScannedSource,
  SearchProvider,
  TechnicalOutcome,
  VerificationCoverage,
  VerdictType
} from "@/lib/types";

const autoSearchQueryLimit = 10;
const maxSourcesToVerify = 24;

type SearchExecutionQuery = {
  query: string;
  market: "DOMESTIC" | "OVERSEAS";
  intent: "PAIN" | "WORKAROUND" | "PAYMENT" | "COMPETITOR";
  source: "KIMI_GENERAL" | "REDDIT_PAIN_REWRITE";
};

export type JudgmentProgressEvent =
  | { type: "stage"; stage: string; message: string }
  | { type: "queries_generated"; queryCount: number; queries: string[] }
  | { type: "sources_found"; candidateCount: number }
  | {
      type: "source_verified";
      checkedCount: number;
      completedCount: number;
      totalCount: number;
      candidateCount: number;
      deduplicatedCount: number;
      accessibleCount: number;
      blockedCount: number;
      rateLimitedCount: number;
      notFoundCount: number;
      timeoutCount: number;
      networkErrorCount: number;
      unsupportedContentCount: number;
      invalidUrlCount: number;
      unverifiedCount: number;
      cacheHitCount: number;
      networkRequestCount: number;
    }
  | {
      type: "signal_classified";
      classifiedCount: number;
      strongCount: number;
      mediumCount: number;
      weakCount: number;
      irrelevantCount: number;
    }
  | { type: "opportunities_generated"; opportunityCount: number };

export type JudgmentProgressEmitter = (event: JudgmentProgressEvent) => void | Promise<void>;

export function needsClarification(idea: string, answers?: AnalyzeRequest["clarificationAnswers"]): ClarificationResponse | null {
  if (answers?.targetUser || answers?.painfulScene || answers?.productForm) return null;

  const normalized = idea.replace(/\s+/g, "");
  const genericIdeas = ["AI工具", "副业工具", "学习工具", "小红书工具", "记账工具", "效率工具", "简历工具", "健身工具"];
  const tooGeneric = normalized.length <= 8 || genericIdeas.some((item) => normalized === item || normalized.endsWith(item));

  if (!tooGeneric) return null;

  return {
    status: "needs_clarification",
    questions: [
      {
        id: "targetUser",
        question: "你想先服务谁？",
        placeholder: "比如：自由职业者、大学生、刚开始做小红书的人"
      },
      {
        id: "painfulScene",
        question: "这个人现在最麻烦的场景是什么？",
        placeholder: "比如：月底对账很崩溃、每天不知道写什么标题"
      },
      {
        id: "productForm",
        question: "你想先做网页、小程序、资料包，还是服务？",
        placeholder: "比如：先做一个网页表单 + 人工交付"
      }
    ]
  };
}

export async function generateIdeaJudgment(input: AnalyzeRequest, emit?: JudgmentProgressEmitter, usage?: Omit<ApiUsageContext, "operation">): Promise<IdeaJudgment> {
  await emit?.({ type: "stage", stage: "interpreting", message: "正在理解你的想法" });
  const clarifiedIdea = clarifyIdea(input.idea, input.clarificationAnswers);
  const interpretation = await interpretIdea(clarifiedIdea, usage);

  await emit?.({ type: "stage", stage: "query_generation", message: "正在生成需求搜索词" });
  const searchQueryPlan = await generateSearchQueryPlan(clarifiedIdea, interpretation.interpretedIdea, usage);
  const executionQueries = buildSearchExecutionQueries(searchQueryPlan, clarifiedIdea, interpretation.interpretedIdea);
  const searchQueries = executionQueries.map((item) => item.query);
  await emit?.({ type: "queries_generated", queryCount: searchQueries.length, queries: searchQueries });

  const signalResult = await scanSourcesAndClassifySignals(input, clarifiedIdea, interpretation.interpretedIdea, executionQueries, emit, usage);
  const buckets = bucketSources(signalResult.scannedSources);
  await emit?.({
    type: "signal_classified",
    classifiedCount: buckets.accessibleSources.length,
    strongCount: buckets.strongSignals.length,
    mediumCount: buckets.mediumSignals.length,
    weakCount: buckets.weakSignals.length,
    irrelevantCount: buckets.irrelevantSources.length
  });

  await emit?.({ type: "stage", stage: "scoring", message: "正在评估付费可能性" });
  const scores = scoreJudgment({
    idea: clarifiedIdea,
    interpretedIdea: interpretation.interpretedIdea,
    sources: signalResult.scannedSources,
    usableEvidence: signalResult.usableEvidence
  });
  const verdict = decideVerdict(scores, buckets);

  await emit?.({ type: "stage", stage: "mvp_compression", message: "正在压缩 MVP" });
  const opportunities = await maybeGenerateOpportunities({
    verdict,
    idea: clarifiedIdea,
    interpretedIdea: interpretation.interpretedIdea,
    evidence: signalResult.usableEvidence,
    usage
  });
  await emit?.({ type: "opportunities_generated", opportunityCount: opportunities.length });

  await emit?.({ type: "stage", stage: "today_action", message: "正在生成今天行动" });
  const todayAction = await generateTodayAction({
    idea: clarifiedIdea,
    interpretedIdea: interpretation.interpretedIdea,
    sources: signalResult.scannedSources,
    searchQueries,
    opportunity: opportunities[0],
    usage
  });

  return enrichJudgmentTrust({
    originalIdea: input.idea,
    clarifiedIdea: clarifiedIdea === input.idea ? undefined : clarifiedIdea,
    interpretedIdea: summarizeInterpretedIdea(interpretation.interpretedIdea),
    technicalOutcome: signalResult.technicalOutcome,
    verdict,
    verdictText: verdictText(verdict),
    verdictReason: verdictReason(verdict, scores, buckets),
    scores,
    searchQueries,
    scannedSources: signalResult.scannedSources,
    accessibleSources: buckets.accessibleSources,
    inaccessibleSources: buckets.inaccessibleSources,
    strongSignals: buckets.strongSignals,
    mediumSignals: buckets.mediumSignals,
    weakSignals: buckets.weakSignals,
    irrelevantSources: buckets.irrelevantSources,
    opportunities,
    todayAction,
    verificationCoverage: signalResult.verificationCoverage,
    partialVerificationWarning: signalResult.verificationCoverage.partial
      ? "部分来源尚未完成独立直接验证；它们仍保留为搜索线索，但不会计入正式证据。"
      : undefined,
    warnings: [
      ...interpretation.warnings,
      ...signalResult.warnings,
      ...(signalResult.usedKimi ? [] : ["需求信号分类未使用 Kimi 生成强证据。"]),
      ...(signalResult.searchUsedKimi ? [] : [`搜索 provider: ${signalResult.searchProvider}`])
    ]
  });
}

function buildSearchExecutionQueries(items: SearchQueryPlanItem[], idea: string, interpretedIdea: InterpretedIdea): SearchExecutionQuery[] {
  const kimiQueries: SearchExecutionQuery[] = items.map((item) => ({
    query: item.query,
    market: item.market,
    intent: item.intent,
    source: "KIMI_GENERAL"
  }));
  const redditPlan = buildRedditResearchPlan(idea, interpretedIdea);
  const redditQueries: SearchExecutionQuery[] = redditPlan.queries.slice(0, 5).map((query) => ({
    query,
    market: "OVERSEAS",
    intent: "PAIN",
    source: "REDDIT_PAIN_REWRITE"
  }));

  return uniqueExecutionQueries([...kimiQueries.slice(0, 6), ...redditQueries]).slice(0, autoSearchQueryLimit);
}

function uniqueExecutionQueries(items: SearchExecutionQuery[]) {
  const seen = new Set<string>();
  const output: SearchExecutionQuery[] = [];

  for (const item of items) {
    const key = item.query.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push({ ...item, query: item.query.trim() });
  }

  return output;
}

async function scanSourcesAndClassifySignals(
  input: AnalyzeRequest,
  idea: string,
  interpretedIdea: InterpretedIdea,
  executionQueries: SearchExecutionQuery[],
  emit?: JudgmentProgressEmitter,
  usage?: Omit<ApiUsageContext, "operation">
): Promise<{
  scannedSources: ScannedSource[];
  usableEvidence: EvidenceSource[];
  warnings: string[];
  usedKimi: boolean;
  searchProvider: SearchProvider;
  searchUsedKimi: boolean;
  verificationCoverage: VerificationCoverage;
  technicalOutcome?: TechnicalOutcome;
}> {
  const env = getServerEnv();

  if (input.mode === "manual_paste") {
    const adapter = new ManualPasteAdapter(idea, input.pastedContent ?? "");
    const results = await adapter.search();
    await emit?.({ type: "sources_found", candidateCount: 1 });
    const manualCoverage: VerificationCoverage = {
      totalCandidates: 1,
      deduplicatedCandidates: 1,
      completedCount: 1,
      accessibleCount: 1,
      blockedCount: 0,
      rateLimitedCount: 0,
      notFoundCount: 0,
      timeoutCount: 0,
      networkErrorCount: 0,
      unsupportedContentCount: 0,
      invalidUrlCount: 0,
      unverifiedCount: 0,
      cacheHitCount: 0,
      networkRequestCount: 0,
      concurrency: 1,
      perHostConcurrency: 1,
      timeoutMs: 0,
      totalBudgetMs: 0,
      durationMs: null,
      partial: false,
      searchResultCount: 0,
      extractedContentCount: 1,
      searchLeadCount: 0,
      directVerifiedCount: 0,
      searchStage: notRunStage(),
      extractionStage: notRunStage(),
      directVerificationStage: notRunStage()
    };
    await emitSourceProgress(manualCoverage, emit);

    const manualSource: ScannedSource = {
      id: "manual-1",
      title: results[0]?.title ?? "用户粘贴内容",
      url: "",
      platform: "用户粘贴内容",
      query: "manual_paste",
      isAccessible: true,
      verificationStatus: "ACCESSIBLE",
      verificationOrigin: "MANUAL",
      contentExtractionStatus: "CONTENT_EXTRACTED",
      origin: "USER_PASTED",
      provider: "USER",
      evidenceAvailability: "CONFIRMED_CONTENT",
      rawContent: input.pastedContent ?? "",
      extractedText: input.pastedContent ?? ""
    };
    await emit?.({ type: "stage", stage: "signal_classification", message: "正在同步判断需求信号" });
    const classified = await extractDemandSignals({ idea, interpretedIdea, accessibleSources: [manualSource], usage });
    const scannedSources = (classified.scannedSources.length ? classified.scannedSources : [manualSource]).map(enrichSourceRecord);
    const usableEvidence = bindQualifiedEvidenceToSources(classified.usableEvidence, scannedSources);
    await emitClassifiedProgress(scannedSources, emit);

    return {
      scannedSources,
      usableEvidence,
      warnings: classified.warnings,
      usedKimi: classified.usedKimi,
      searchProvider: adapter.provider,
      searchUsedKimi: false,
      verificationCoverage: manualCoverage,
      technicalOutcome: undefined
    };
  }

  await emit?.({ type: "stage", stage: "searching", message: "正在搜索公开网页" });
  let provider;
  try {
    provider = createRuntimeSearchProvider();
  } catch (error) {
    if (error instanceof SearchNotConfiguredError) {
      const coverage = emptyCoverage();
      await emitSourceProgress(coverage, emit);
      return {
        scannedSources: [],
        usableEvidence: [],
        warnings: ["自动搜索尚未配置 Tavily API Key，本次进入假设验证模式，不生成证据型结论。"],
        usedKimi: false,
        searchProvider: "tavily",
        searchUsedKimi: false,
        verificationCoverage: coverage,
        technicalOutcome: "SEARCH_NOT_CONFIGURED"
      };
    }
    throw error;
  }

  const providerName = provider.provider;
  const providerId = toSearchProviderId(providerName);
  const providerLabel = toProviderPlatformLabel(providerName);
  const providerSupportsExtract = provider.getCapabilities().extract;
  const trustedResults: TrustedSearchResult[] = [];
  const searchStartedAt = Date.now();
  let successfulSearchRequests = 0;
  try {
    for (const query of executionQueries.slice(0, autoSearchQueryLimit)) {
      const response = await provider.search({
        query: query.query,
        maxResults: env.searchMaxResults,
        sessionId: usage?.judgmentId ?? "unknown-judgment",
        querySource: query.source,
        market: query.market,
        intent: query.intent
      });
      successfulSearchRequests += 1;
      trustedResults.push(...response.results);
    }
  } catch (error) {
    const searchCompletedAt = Date.now();
    const coverage = emptyCoverage({
      searchStage: createStageMetrics({
        startedAt: searchStartedAt,
        completedAt: searchCompletedAt,
        attemptedCount: executionQueries.length,
        succeededCount: successfulSearchRequests,
        failedCount: Math.max(1, executionQueries.length - successfulSearchRequests)
      })
    });
    await emitSourceProgress(coverage, emit);
    const message = error instanceof SearchProviderApiError || error instanceof Error ? error.message : "Tavily 搜索失败";
    return {
      scannedSources: [],
      usableEvidence: [],
      warnings: [`真实搜索失败：${message}`],
      usedKimi: false,
      searchProvider: providerId,
      searchUsedKimi: false,
      verificationCoverage: coverage,
      technicalOutcome: "SEARCH_FAILED"
    };
  }

  const searchCompletedAt = Date.now();
  const searchStage = createStageMetrics({
    startedAt: searchStartedAt,
    completedAt: searchCompletedAt,
    attemptedCount: executionQueries.length,
    succeededCount: successfulSearchRequests,
    failedCount: Math.max(0, executionQueries.length - successfulSearchRequests)
  });

  await emit?.({ type: "sources_found", candidateCount: trustedResults.length });

  if (trustedResults.length === 0) {
    const coverage = emptyCoverage({ searchStage });
    await emitSourceProgress(coverage, emit);
    return {
      scannedSources: [],
      usableEvidence: [],
      warnings: ["Tavily 真实搜索没有返回结果。这不等于没有需求，只代表本次没有搜索线索。"],
      usedKimi: false,
      searchProvider: providerId,
      searchUsedKimi: false,
      verificationCoverage: coverage,
      technicalOutcome: "NO_SEARCH_RESULTS"
    };
  }

  await emit?.({ type: "stage", stage: "source_deduplication", message: "正在规范化和去重 Tavily 来源" });
  const unique = deduplicateTrustedResults(trustedResults, { maxPerHost: 6, maxTotal: maxSourcesToVerify });

  await emit?.({ type: "stage", stage: "source_extraction", message: "正在用 Tavily Extract 获取可分析正文" });
  const extractionStartedAt = Date.now();
  const extractedByUrl = new Map<string, Awaited<ReturnType<typeof provider.extract>>["results"][number]>();
  const extractionFailureByUrl = new Map<string, string>();

  const extractResponses = providerSupportsExtract
    ? await mapWithConcurrency(chunk(unique, 5), 3, async (batch) => {
        try {
          const response = await provider.extract({
            urls: batch.map((item) => item.url),
            query: batch.map((item) => item.title).join(" | ").slice(0, 500),
            sessionId: usage?.judgmentId ?? "unknown-judgment",
            searchRequestId: batch[0]?.searchRequestId ?? undefined
          });
          return { batch, response, error: null as string | null };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Provider extract failed";
          return { batch, response: null, error: message };
        }
      })
    : [];

  for (const extractBatch of extractResponses) {
    if (!extractBatch.response) {
      for (const item of extractBatch.batch) extractionFailureByUrl.set(item.normalizedUrl, extractBatch.error ?? "Tavily Extract failed");
      continue;
    }
    for (const item of extractBatch.response.results) {
      extractedByUrl.set(item.normalizedUrl || normalizeTrustedUrl(item.url), item);
    }
  }

  const extractionCompletedAt = Date.now();
  const extractedContentCount = unique.filter((result) => extractedByUrl.get(result.normalizedUrl)?.evidenceAvailability === "CONFIRMED_CONTENT").length;
  const searchLeadCount = Math.max(0, unique.length - extractedContentCount);
  const extractionStage = providerSupportsExtract
    ? createStageMetrics({
        startedAt: extractionStartedAt,
        completedAt: extractionCompletedAt,
        attemptedCount: unique.length,
        succeededCount: extractedContentCount,
        failedCount: searchLeadCount
      })
    : notRunStage();

  await emit?.({ type: "stage", stage: "source_verification", message: "正在独立直接验证原始来源 URL" });
  const directStartedAt = Date.now();
  const directVerification = await verifySourcesConcurrently(
    unique.map((result) => ({
      id: result.id,
      title: result.title,
      url: result.url,
      originalUrl: result.url,
      normalizedUrl: result.normalizedUrl,
      platform: "",
      query: `${providerLabel}-search`
    })),
    {
      concurrency: env.sourceVerifyConcurrency,
      perHostConcurrency: env.sourceVerifyPerHostConcurrency,
      timeoutMs: env.sourceVerifyTimeoutMs,
      totalBudgetMs: env.sourceVerifyTotalBudgetMs,
      onProgress: (progress) => void emitSourceProgress(progress, emit)
    }
  );
  const directCompletedAt = Date.now();
  const directById = new Map(directVerification.results.map((result) => [result.sourceId, result]));
  const directCoverage = directVerification.coverage;
  const directVerificationStage = createStageMetrics({
    startedAt: directStartedAt,
    completedAt: directCompletedAt,
    attemptedCount: unique.length,
    succeededCount: directCoverage.accessibleCount,
    failedCount: Math.max(0, directCoverage.completedCount - directCoverage.accessibleCount),
    timeoutCount: directCoverage.timeoutCount,
    blockedCount: directCoverage.blockedCount,
    rateLimitedCount: directCoverage.rateLimitedCount
  });

  const scannedSources = mergeSourcePipelineFacts({
    searchResults: unique,
    extractedByUrl,
    extractionFailureByUrl,
    directById,
    searchStage,
    extractionStage
  });
  const sourceLeadCount = scannedSources.filter((source) => source.evidenceAvailability === "SEARCH_LEAD").length;

  const coverage: VerificationCoverage = {
    ...directCoverage,
    totalCandidates: trustedResults.length,
    deduplicatedCandidates: unique.length,
    searchResultCount: trustedResults.length,
    extractedContentCount,
    searchLeadCount: sourceLeadCount,
    directVerifiedCount: directCoverage.accessibleCount,
    searchStage,
    extractionStage,
    directVerificationStage
  };
  await emitSourceProgress(coverage, emit);

  const confirmedSources = scannedSources.filter((source) => source.evidenceAvailability === "CONFIRMED_CONTENT" && source.isAccessible);
  const classifier = createSignalClassifier({
    idea,
    interpretedIdea,
    emit,
    concurrency: env.signalClassificationConcurrency,
    usage
  });
  confirmedSources.forEach((source) => classifier.enqueue(source));
  await classifier.waitForIdle();

  const classifiedById = classifier.getClassifiedSources();
  const mergedSources = scannedSources.map((source) => enrichSourceRecord(classifiedById.get(source.id) ?? source));
  const usableEvidence = bindQualifiedEvidenceToSources(classifier.getUsableEvidence(), mergedSources);

  return {
    scannedSources: mergedSources,
    usableEvidence,
    warnings: buildVerificationWarnings(coverage, classifier.getWarnings()),
    usedKimi: classifier.usedKimi(),
    searchProvider: providerId,
    searchUsedKimi: false,
    verificationCoverage: coverage,
    technicalOutcome: confirmedSources.length === 0 ? "EXTRACTION_INCOMPLETE" : undefined
  };
}

export function mergeSourcePipelineFacts({
  searchResults,
  extractedByUrl,
  extractionFailureByUrl,
  directById,
  searchStage,
  extractionStage
}: {
  searchResults: TrustedSearchResult[];
  extractedByUrl: Map<string, ExtractedContent>;
  extractionFailureByUrl: Map<string, string>;
  directById: Map<string, SourceVerificationResult>;
  searchStage: PipelineStageMetrics;
  extractionStage: PipelineStageMetrics;
}): ScannedSource[] {
  return searchResults.map((result, index) => {
    const extracted = extractedByUrl.get(result.normalizedUrl);
    const direct = directById.get(result.id);
    const extractedContent = extracted?.evidenceAvailability === "CONFIRMED_CONTENT";
    const directlyAccessible = direct?.status === "ACCESSIBLE" || direct?.status === "REDIRECTED_ACCESSIBLE";
    // Search snippets remain leads. Only provider extraction or our direct verifier's page text can become evidence.
    const directContent = directlyAccessible && hasSufficientEvidenceText(direct?.excerpt ?? "");
    const confirmedContent = Boolean(extractedContent || directContent);
    const sourceText = extractedContent ? extracted?.rawContent ?? "" : directContent ? direct?.excerpt ?? "" : result.excerpt;
    const extractionFailureReason = extractionFailureByUrl.get(result.normalizedUrl) ?? extracted?.failureReason;
    return {
      id: `s${index + 1}`,
      title: extracted?.title ?? direct?.title ?? result.title,
      url: result.url,
      normalizedUrl: result.normalizedUrl,
      finalUrl: direct?.finalUrl ?? result.url,
      platform: direct?.platform || toProviderPlatformLabel(result.provider),
      query: result.query ?? "",
      isAccessible: directlyAccessible,
      statusCode: direct?.statusCode ?? null,
      httpStatus: direct?.httpStatus ?? null,
      verificationStatus: direct?.status ?? ("UNVERIFIED" as const),
      verificationOrigin: direct?.verificationOrigin,
      searchDiscoveryStatus: "SEARCH_DISCOVERED" as const,
      searchDiscoveredAt: searchStage.completedAt ?? undefined,
      contentExtractionStatus: confirmedContent
        ? ("CONTENT_EXTRACTED" as const)
        : extractionFailureByUrl.has(result.normalizedUrl)
          ? ("EXTRACTION_FAILED" as const)
          : ("INSUFFICIENT_TEXT" as const),
      contentExtractedAt: extractedContent ? extractionStage.completedAt ?? undefined : directContent ? direct?.checkedAt ?? undefined : undefined,
      extractionFailureReason: confirmedContent ? undefined : extractionFailureReason,
      redirectCount: direct?.redirectCount ?? 0,
      verificationErrorCode: direct?.errorCode ?? undefined,
      origin: "SEARCH_PROVIDER" as const,
      provider: result.provider,
      providerRequestId: extracted?.providerRequestId ?? result.providerRequestId,
      searchRequestId: extracted?.searchRequestId ?? result.searchRequestId,
      evidenceAvailability: confirmedContent ? "CONFIRMED_CONTENT" : "SEARCH_LEAD",
      rawContent: confirmedContent ? sourceText : undefined,
      extractedText: sourceText,
      failureReason: direct?.failureReason,
      contentType: direct?.contentType ?? undefined,
      checkedAt: direct?.checkedAt ?? null,
      durationMs: direct?.durationMs ?? null,
      relevanceScore: Math.round((result.score ?? 0) * 100)
    } satisfies ScannedSource;
  });
}

async function maybeGenerateOpportunities({
  verdict,
  idea,
  interpretedIdea,
  evidence,
  usage
}: {
  verdict: VerdictType;
  idea: string;
  interpretedIdea: InterpretedIdea;
  evidence: EvidenceSource[];
  usage?: Omit<ApiUsageContext, "operation">;
}): Promise<Opportunity[]> {
  if (verdict === "TALK_TO_USERS" || verdict === "KILL_OR_REFRAME" || evidence.length < 2) return [];

  const generated = await generateOpportunities({ idea, interpretedIdea, evidence, usage });
  return generated.opportunities
    .map((item, index) => convertOpportunity(item, evidence, idea, index))
    .filter((item) => item.sourceIds.length > 0);
}

function createSignalClassifier({
  idea,
  interpretedIdea,
  emit,
  concurrency,
  usage
}: {
  idea: string;
  interpretedIdea: InterpretedIdea;
  emit?: JudgmentProgressEmitter;
  concurrency: number;
  usage?: Omit<ApiUsageContext, "operation">;
}) {
  const queue: ScannedSource[] = [];
  const running = new Set<Promise<void>>();
  const acceptedIds = new Set<string>();
  const classifiedSources = new Map<string, ScannedSource>();
  const usableEvidence: EvidenceSource[] = [];
  const warnings = new Set<string>();
  let kimiUsed = false;
  let stageSent = false;

  const emitProgress = () => {
    const buckets = bucketSources(Array.from(classifiedSources.values()));
    void emit?.({
      type: "signal_classified",
      classifiedCount: classifiedSources.size,
      strongCount: buckets.strongSignals.length,
      mediumCount: buckets.mediumSignals.length,
      weakCount: buckets.weakSignals.length,
      irrelevantCount: buckets.irrelevantSources.length
    });
  };

  const pump = () => {
    while (running.size < concurrency && queue.length > 0) {
      const source = queue.shift();
      if (!source) continue;

      if (!stageSent) {
        stageSent = true;
        void emit?.({ type: "stage", stage: "signal_classification", message: "正在同步判断需求信号" });
      }

      const task = extractDemandSignals({ idea, interpretedIdea, accessibleSources: [source], usage })
        .then((result) => {
          kimiUsed = kimiUsed || result.usedKimi;
          result.warnings.forEach((warning) => warnings.add(warning));
          result.usableEvidence.forEach((evidence) => usableEvidence.push(evidence));
          classifiedSources.set(source.id, result.scannedSources[0] ?? classifySourceAsWeak(source, "需求信号提取没有返回该来源的结果。"));
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "需求信号分类失败";
          warnings.add("部分来源需求信号分类失败；系统不会把它们当作强证据。");
          classifiedSources.set(source.id, classifySourceAsWeak(source, message));
        })
        .finally(() => {
          running.delete(task);
          emitProgress();
          pump();
        });

      running.add(task);
    }
  };

  return {
    enqueue(source: ScannedSource) {
      if (acceptedIds.has(source.id)) return;
      acceptedIds.add(source.id);
      queue.push(source);
      pump();
    },
    async waitForIdle() {
      while (queue.length > 0 || running.size > 0) {
        pump();
        if (running.size === 0) continue;
        await Promise.race(running);
      }
    },
    getClassifiedSources() {
      return classifiedSources;
    },
    getUsableEvidence() {
      return usableEvidence;
    },
    getWarnings() {
      return Array.from(warnings);
    },
    usedKimi() {
      return kimiUsed;
    }
  };
}

function classifySourceAsWeak(source: ScannedSource, reason: string): ScannedSource {
  return {
    ...source,
    signalStrength: "weak",
    whyRejected: `需求信号分类失败，不能当作强/中信号：${reason}`,
    relevanceScore: 20
  };
}

export function bindQualifiedEvidenceToSources(evidence: EvidenceSource[], sources: ScannedSource[]): EvidenceSource[] {
  const byUrl = new Map<string, ScannedSource>();
  for (const source of sources) {
    for (const value of [source.url, source.normalizedUrl, source.finalUrl]) {
      if (value) byUrl.set(normalizeEvidenceUrl(value), source);
    }
  }

  return evidence.flatMap((item) => {
    const source =
      sources.find((candidate) => item.id === candidate.id || item.id.startsWith(`${candidate.id}-e`)) ??
      (item.url ? byUrl.get(normalizeEvidenceUrl(item.url)) : sources.find((candidate) => candidate.origin === "USER_PASTED"));

    if (
      !source ||
      source.evidenceEligibility !== "ELIGIBLE_USER_EVIDENCE" ||
      (source.finalEvidenceStrength !== "strong" && source.finalEvidenceStrength !== "medium") ||
      !source.qualifyingExcerpt
    ) {
      return [];
    }

    const finalStrength = source.finalEvidenceStrength;
    return [
      {
        ...item,
        id: source.sourceDisplayId ?? source.id,
        title: source.title,
        url: source.origin === "USER_PASTED" ? undefined : source.finalUrl ?? source.url,
        sourceText: source.qualifyingExcerpt,
        evidenceStrength: finalStrength,
        modelSuggestedStrength: source.modelSuggestedStrength === "irrelevant" ? "weak" : source.modelSuggestedStrength,
        finalEvidenceStrength: finalStrength,
        evidenceEligibility: source.evidenceEligibility,
        hardRuleReasonCodes: source.hardRuleReasonCodes,
        qualifyingExcerpt: source.qualifyingExcerpt,
        qualifyingSignals: source.qualifyingSignals,
        sourceVerification: {
          isExternalVerified: source.origin !== "USER_PASTED" && source.isAccessible,
          statusCode: source.statusCode ?? undefined
        }
      }
    ];
  });
}

function normalizeEvidenceUrl(value: string) {
  return value.trim().replace(/\/$/, "").toLowerCase();
}

async function emitSourceProgress(progress: VerificationProgress | VerificationCoverage, emit?: JudgmentProgressEmitter) {
  await emit?.({
    type: "source_verified",
    checkedCount: progress.completedCount,
    completedCount: progress.completedCount,
    totalCount: progress.deduplicatedCandidates,
    candidateCount: progress.totalCandidates,
    deduplicatedCount: progress.deduplicatedCandidates,
    accessibleCount: progress.accessibleCount,
    blockedCount: progress.blockedCount,
    rateLimitedCount: progress.rateLimitedCount,
    notFoundCount: progress.notFoundCount,
    timeoutCount: progress.timeoutCount,
    networkErrorCount: progress.networkErrorCount,
    unsupportedContentCount: progress.unsupportedContentCount,
    invalidUrlCount: progress.invalidUrlCount,
    unverifiedCount: progress.unverifiedCount,
    cacheHitCount: progress.cacheHitCount,
    networkRequestCount: progress.networkRequestCount
  });
}

async function emitClassifiedProgress(sources: ScannedSource[], emit?: JudgmentProgressEmitter) {
  const buckets = bucketSources(sources);
  await emit?.({
    type: "signal_classified",
    classifiedCount: sources.length,
    strongCount: buckets.strongSignals.length,
    mediumCount: buckets.mediumSignals.length,
    weakCount: buckets.weakSignals.length,
    irrelevantCount: buckets.irrelevantSources.length
  });
}

function toSearchProviderId(provider: SearchProviderName): SearchProvider {
  if (provider === "TAVILY") return "tavily";
  if (provider === "BRAVE") return "brave";
  if (provider === "EXA") return "exa";
  return "perplexity_search";
}

function toProviderPlatformLabel(provider: SearchProviderName): string {
  if (provider === "PERPLEXITY_SEARCH") return "perplexity";
  return provider.toLowerCase();
}

function hasSufficientEvidenceText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length >= 300 && (normalized.match(/[A-Za-z0-9]+|[\u4e00-\u9fff]{2,}/g)?.length ?? 0) >= 40;
}

function emptyCoverage(overrides: Partial<VerificationCoverage> = {}): VerificationCoverage {
  return {
    totalCandidates: 0,
    deduplicatedCandidates: 0,
    completedCount: 0,
    accessibleCount: 0,
    blockedCount: 0,
    rateLimitedCount: 0,
    notFoundCount: 0,
    timeoutCount: 0,
    networkErrorCount: 0,
    unsupportedContentCount: 0,
    invalidUrlCount: 0,
    unverifiedCount: 0,
    cacheHitCount: 0,
    networkRequestCount: 0,
    concurrency: 0,
    perHostConcurrency: 0,
    timeoutMs: 0,
    totalBudgetMs: 0,
    durationMs: null,
    partial: false,
    searchResultCount: 0,
    extractedContentCount: 0,
    searchLeadCount: 0,
    directVerifiedCount: 0,
    searchStage: notRunStage(),
    extractionStage: notRunStage(),
    directVerificationStage: notRunStage(),
    ...overrides
  };
}

function notRunStage(): PipelineStageMetrics {
  return {
    startedAt: null,
    completedAt: null,
    durationMs: null,
    attemptedCount: 0,
    succeededCount: 0,
    failedCount: 0,
    timeoutCount: 0,
    blockedCount: 0,
    rateLimitedCount: 0
  };
}

function createStageMetrics({
  startedAt,
  completedAt,
  attemptedCount,
  succeededCount,
  failedCount,
  timeoutCount = 0,
  blockedCount = 0,
  rateLimitedCount = 0
}: {
  startedAt: number;
  completedAt: number;
  attemptedCount: number;
  succeededCount: number;
  failedCount: number;
  timeoutCount?: number;
  blockedCount?: number;
  rateLimitedCount?: number;
}): PipelineStageMetrics {
  return {
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    durationMs: Math.max(0, completedAt - startedAt),
    attemptedCount,
    succeededCount,
    failedCount,
    timeoutCount,
    blockedCount,
    rateLimitedCount
  };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index]);
      }
    })
  );

  return results;
}

function buildVerificationWarnings(coverage: VerificationCoverage, classifierWarnings: string[]) {
  const warnings = [...classifierWarnings];

  if (coverage.partial) {
    warnings.push("部分来源尚未完成独立直接验证；它们仍保留为搜索线索，但不会计入正式证据。");
  }

  if (coverage.accessibleCount < 3) {
    warnings.push("本次独立直接验证通过的来源不足 3 条，系统不会给出高置信度开发建议。");
  }

  if (coverage.blockedCount > 0) {
    warnings.push("部分页面可能能在浏览器中打开，但拒绝 RealNeed 服务端自动访问，因此不计入有效证据。");
  }

  if ((coverage.extractionStage?.failedCount ?? 0) > 0) {
    warnings.push("部分真实搜索结果未取得足够正文，已保留为 SEARCH_LEAD，不计入正式证据。");
  }

  if (coverage.timeoutCount > 0) {
    warnings.push("部分来源独立直接验证超时；超时不等于链接不存在。未验证通过前不计入正式证据。");
  }

  return Array.from(new Set(warnings));
}

function convertOpportunity(item: ProductOpportunity, evidence: EvidenceSource[], idea: string, index: number): Opportunity {
  const related = evidence.filter((source) => item.sourceEvidenceIds.includes(source.id));

  return {
    id: item.id || `op${index + 1}`,
    productName: item.productName,
    oneSentence: item.oneSentence,
    targetUser: item.targetUser,
    compressedFromOriginalIdea: `从“${idea}”里砍掉平台化、复杂自动化和大而全叙事，只保留一个能在 1-3 天交付的小问题。`,
    painPoint: item.painPoint,
    mvpOnly: item.mvp,
    doNotBuildYet: ["完整账号系统", "复杂第三方 API 集成", "社区或平台功能", "自动化闭环和数据大屏"],
    firstThreeDaysBuildPlan: [
      "Day 1：做一个单页表单，收集用户输入、联系方式和当前解决方式。",
      "Day 2：用人工或半自动方式交付 3 个样例结果。",
      "Day 3：整理反馈，判断用户是否愿意继续使用或付费。"
    ],
    firstValidationAction: item.firstStep,
    monetization: item.monetization,
    chinaFit: item.chinaFit,
    biggestRisk: item.risks[0] ?? "用户可能觉得问题麻烦，但不愿意为这个小交付付费。",
    sourceIds: related.map((source) => source.id),
    score: item.evidenceScore
  };
}

function scoreJudgment({
  idea,
  interpretedIdea,
  sources,
  usableEvidence
}: {
  idea: string;
  interpretedIdea: InterpretedIdea;
  sources: ScannedSource[];
  usableEvidence: EvidenceSource[];
}): JudgmentScore {
  const buckets = bucketSources(sources);
  const demandSignal = clamp(buckets.strongSignals.length * 34 + buckets.mediumSignals.length * 22 + buckets.weakSignals.length * 8, 0, 100);
  const paymentSignal = scorePaymentSignal(sources);
  const beginnerFeasibility = scoreBeginnerFeasibility(idea, interpretedIdea);
  const mvpSimplicity = scoreMvpSimplicity(idea, usableEvidence);
  const distributionAccess = scoreDistributionAccess(sources, interpretedIdea);
  const overall = Math.round(demandSignal * 0.3 + paymentSignal * 0.2 + beginnerFeasibility * 0.18 + mvpSimplicity * 0.18 + distributionAccess * 0.14);

  return { demandSignal, paymentSignal, beginnerFeasibility, mvpSimplicity, distributionAccess, overall };
}

function scorePaymentSignal(sources: ScannedSource[]) {
  const text = sources.map((source) => `${source.title} ${source.extractedText ?? ""}`).join(" ").toLowerCase();
  const paidSignals = ["paid", "pay", "pricing", "subscription", "cost", "invoice", "client", "business", "省时间", "收入", "客户", "付费", "订阅", "成本"];
  const hits = paidSignals.filter((signal) => text.includes(signal.toLowerCase())).length;
  return clamp(34 + hits * 10, 18, 88);
}

function scoreBeginnerFeasibility(idea: string, interpretedIdea: InterpretedIdea) {
  const text = `${idea} ${interpretedIdea.domain}`.toLowerCase();
  const hard = ["社交", "社区", "平台", "电商", "地图", "硬件", "区块链", "native", "mobile"];
  const easy = ["表单", "网页", "清单", "模板", "整理", "生成", "检查", "记账", "标题", "计划"];
  return clamp(70 + easy.filter((item) => text.includes(item)).length * 6 - hard.filter((item) => text.includes(item)).length * 14, 20, 92);
}

function scoreMvpSimplicity(idea: string, evidence: EvidenceSource[]) {
  const text = `${idea} ${evidence.map((item) => item.painPoint).join(" ")}`.toLowerCase();
  const simple = ["表单", "粘贴", "手动", "整理", "清单", "模板", "单页", "manual", "spreadsheet"];
  return clamp(62 + simple.filter((item) => text.includes(item)).length * 6, 28, 90);
}

function scoreDistributionAccess(sources: ScannedSource[], interpretedIdea: InterpretedIdea) {
  const hasSources = sources.filter((source) => source.isAccessible).length;
  const hasTarget = interpretedIdea.targetUsers.length > 0 ? 12 : 0;
  return clamp(32 + hasSources * 6 + hasTarget, 20, 88);
}

function decideVerdict(scores: JudgmentScore, buckets: ReturnType<typeof bucketSources>): VerdictType {
  const usableSignals = buckets.strongSignals.length + buckets.mediumSignals.length;

  if (buckets.accessibleSources.length < 3) {
    if (usableSignals >= 2) return "VALIDATE_FIRST";
    if (buckets.weakSignals.length >= 1 || usableSignals === 1) return "TALK_TO_USERS";
    return "KILL_OR_REFRAME";
  }

  if (usableSignals >= 2 && scores.overall >= 70 && scores.mvpSimplicity >= 60) return "BUILD_SMALL_MVP";
  if (usableSignals >= 2) return "VALIDATE_FIRST";
  if (buckets.weakSignals.length >= 2 || usableSignals === 1) return "TALK_TO_USERS";
  return "KILL_OR_REFRAME";
}

function verdictText(verdict: VerdictType) {
  const map = {
    BUILD_SMALL_MVP: "值得做一个小 MVP",
    VALIDATE_FIRST: "可以先验证，但不要急着开发",
    TALK_TO_USERS: "信号太弱，建议先找人聊",
    KILL_OR_REFRAME: "不建议直接做，需要换角度"
  } satisfies Record<VerdictType, string>;
  return map[verdict];
}

function verdictReason(verdict: VerdictType, scores: JudgmentScore, buckets: ReturnType<typeof bucketSources>) {
  if (buckets.accessibleSources.length < 3) {
    return `本次可验证来源不足 3 条，建议先人工验证，不建议立即开发。当前可访问来源 ${buckets.accessibleSources.length} 条，总分 ${scores.overall}/100。`;
  }

  if (verdict === "BUILD_SMALL_MVP") return `找到了足够的强/中需求信号，并且 MVP 可以压到较小范围。总分 ${scores.overall}/100。`;
  if (verdict === "VALIDATE_FIRST") return `找到了相关需求信号，但付费可能性或 MVP 范围还不够确定。总分 ${scores.overall}/100。`;
  if (verdict === "TALK_TO_USERS") return `可访问来源存在，但强/中信号不足。当前弱信号 ${buckets.weakSignals.length} 条，建议先找用户聊。`;
  return "没有找到足够明确的真实需求信号。先不要写代码，换一个更具体的人群或场景。";
}

function clarifyIdea(idea: string, answers?: AnalyzeRequest["clarificationAnswers"]) {
  if (!answers) return idea;
  const additions = [
    answers.targetUser && `目标用户：${answers.targetUser}`,
    answers.painfulScene && `痛苦场景：${answers.painfulScene}`,
    answers.productForm && `第一版形态：${answers.productForm}`
  ]
    .filter(Boolean)
    .join("；");
  return additions ? `${idea}。${additions}` : idea;
}

function summarizeInterpretedIdea(idea: InterpretedIdea) {
  return `${idea.domain}；目标用户：${idea.targetUsers.join("、") || "待确认"}；可能痛点：${idea.possiblePainPoints.join("、") || "待确认"}`;
}

function bucketSources(scannedSources: ScannedSource[]) {
  const enrichedSources = scannedSources.map(enrichSourceRecord);
  const accessibleSources = enrichedSources.filter((source) => source.isAccessible || source.origin === "USER_PASTED");
  const inaccessibleSources = enrichedSources.filter((source) => !source.isAccessible && source.origin !== "USER_PASTED");
  const strongSignals = accessibleSources.filter((source) => source.finalEvidenceStrength === "strong");
  const mediumSignals = accessibleSources.filter((source) => source.finalEvidenceStrength === "medium");
  const weakSignals = enrichedSources.filter((source) => source.finalEvidenceStrength === "weak");
  const irrelevantSources = enrichedSources.filter((source) => source.finalEvidenceStrength === "irrelevant");
  return { accessibleSources, inaccessibleSources, strongSignals, mediumSignals, weakSignals, irrelevantSources };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
