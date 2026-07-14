export type AnalyzeMode = "auto_search" | "manual_paste";

export type UserLevel = "vibe_coding_beginner";

export type EvidenceStrength = "weak" | "medium" | "strong";

export type DemandSignalStrength = "strong" | "medium" | "weak" | "irrelevant";

export type Difficulty = "easy" | "medium" | "hard";

export type AnalyzeStatus = "success" | "error" | "evidence_insufficient" | "no_verified_sources";

export type VerdictType = "BUILD_SMALL_MVP" | "VALIDATE_FIRST" | "TALK_TO_USERS" | "KILL_OR_REFRAME";

export type TechnicalOutcome =
  | "READY"
  | "SEARCH_NOT_CONFIGURED"
  | "SEARCH_FAILED"
  | "NO_SEARCH_RESULTS"
  | "EXTRACTION_INCOMPLETE"
  | "VERIFICATION_INCOMPLETE"
  | "SOURCES_BLOCKED"
  | "INSUFFICIENT_EVIDENCE"
  | "ANALYSIS_FAILED"
  | "DATABASE_FAILED"
  | "PROCESSING_FAILED";

export type MarketVerdict = VerdictType | "NOT_AVAILABLE";

export type JudgmentConfidence = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH";

export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED";

export type GenerationStatus = "NOT_STARTED" | "QUEUED" | "GENERATING" | "READY" | "FAILED";

export type DeliveryStatus = "NOT_SENT" | "SENT" | "REVOKED";

export type DeepDiveMode = "EVIDENCE_EXECUTION" | "IDEA_SIGNAL_REPAIR";

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "WAITING_FOR_CREDENTIAL";

export type PaymentSignalLevel = "NONE" | "WEAK" | "MEDIUM" | "STRONG" | "EXPLICIT";

export type MarketScope = "DOMESTIC" | "OVERSEAS" | "CROSS_MARKET" | "UNKNOWN";

export type SourceRecordType =
  | "USER_DISCUSSION"
  | "USER_REVIEW"
  | "QUESTION_ANSWER"
  | "SUPPORT_REQUEST"
  | "COMMUNITY_POST"
  | "USER_COMPLAINT"
  | "MARKETPLACE_LISTING"
  | "PAID_SERVICE"
  | "OFFICIAL_PRODUCT_PAGE"
  | "COMMERCIAL_PROMOTION"
  | "SEO_ARTICLE"
  | "TUTORIAL"
  | "NEWS_ARTICLE"
  | "MEDIA_REVIEW"
  | "TOOL_COMPARISON"
  | "AFFILIATE_PAGE"
  | "MARKET_REPORT_SUMMARY"
  | "VENDOR_DOCUMENTATION"
  | "LANDING_PAGE"
  | "UNKNOWN";

export type EvidenceEligibility = "ELIGIBLE_USER_EVIDENCE" | "BACKGROUND_ONLY" | "COMPETITOR_ONLY" | "IRRELEVANT" | "UNVERIFIED";

export type EvidenceReasonCode =
  | "NON_USER_SOURCE"
  | "COMMERCIAL_CONTENT"
  | "OFFICIAL_CONTENT"
  | "MEDIA_CONTENT"
  | "NO_CONCRETE_USER"
  | "NO_CONCRETE_SCENARIO"
  | "KEYWORD_ONLY_MATCH"
  | "NO_QUALIFYING_EXCERPT"
  | "DUPLICATE_DISCUSSION"
  | "LOW_RELEVANCE"
  | "PAYMENT_SIGNAL_ONLY"
  | "BACKGROUND_INFORMATION_ONLY"
  | "DIRECT_VERIFICATION_REQUIRED"
  | "CONTENT_EXTRACTION_REQUIRED"
  | "PROMPT_INJECTION_DETECTED";

export type SourceOrigin = "SEARCH_PROVIDER" | "USER_PASTED" | "USER_URL" | "MANUAL_IMPORT" | "UNTRUSTED_LEGACY_SOURCE";

export type EvidenceAvailability = "CONFIRMED_CONTENT" | "SEARCH_LEAD" | "NO_EVIDENCE";

export type DirectVerificationStatus =
  | "ACCESSIBLE"
  | "REDIRECTED_ACCESSIBLE"
  | "BLOCKED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "INVALID_URL"
  | "NETWORK_ERROR"
  | "UNSUPPORTED_CONTENT"
  | "BODY_TOO_LARGE"
  | "REDIRECT_BLOCKED"
  | "UNVERIFIED";

export type SourceVerificationStatus = DirectVerificationStatus;

export type VerificationOrigin = "CACHE" | "LIVE" | "MANUAL";

export type PipelineStageMetrics = {
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  attemptedCount: number;
  succeededCount: number;
  failedCount: number;
  timeoutCount: number;
  blockedCount: number;
  rateLimitedCount: number;
};

export type VerificationCoverage = {
  totalCandidates: number;
  deduplicatedCandidates: number;
  completedCount: number;
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
  concurrency: number;
  perHostConcurrency: number;
  timeoutMs: number;
  totalBudgetMs: number;
  durationMs: number | null;
  partial: boolean;
  searchResultCount?: number;
  extractedContentCount?: number;
  searchLeadCount?: number;
  directVerifiedCount?: number;
  searchStage?: PipelineStageMetrics;
  extractionStage?: PipelineStageMetrics;
  directVerificationStage?: PipelineStageMetrics;
};

export type AnalyzeRequest = {
  idea: string;
  mode: AnalyzeMode;
  pastedContent?: string;
  clarificationAnswers?: {
    targetUser?: string;
    painfulScene?: string;
    productForm?: string;
  };
  market: "china";
  userLevel: UserLevel;
};

export type JudgmentScore = {
  demandSignal: number;
  paymentSignal: number;
  beginnerFeasibility: number;
  mvpSimplicity: number;
  distributionAccess: number;
  overall: number;
};

export type InterpretedIdea = {
  domain: string;
  targetUsers: string[];
  possiblePainPoints: string[];
  keywordsZh: string[];
  keywordsEn: string[];
  assumptions: string[];
};

export type SearchResult = {
  title: string;
  url?: string;
  snippet: string;
  platform: string;
  subreddit?: string;
  rawContent?: string;
};

export type SourceCandidate = {
  id: string;
  title: string;
  url: string;
  originalUrl?: string;
  normalizedUrl?: string;
  platform: string;
  snippet?: string;
  query: string;
  rawRank?: number;
};

export type SourceAccessibilityResult = {
  sourceId: string;
  url: string;
  isAccessible: boolean;
  statusCode?: number;
  finalUrl?: string;
  title?: string;
  extractedText?: string;
  failureReason?: string;
};

export type DemandSignal = {
  sourceId: string;
  signalStrength: DemandSignalStrength;
  painPoint?: string;
  targetUser?: string;
  userQuoteOrSummary?: string;
  whyThisSignal?: string;
  whyRejected?: string;
  relevanceScore: number;
};

export type SearchProviderRecord = "TAVILY" | "BRAVE" | "EXA" | "PERPLEXITY_SEARCH";

export type ScannedSource = {
  id: string;
  sourceDisplayId?: string;
  title: string;
  url: string;
  platform: string;
  query: string;
  isAccessible: boolean;
  statusCode?: number | null;
  normalizedUrl?: string;
  finalUrl?: string;
  verificationStatus?: SourceVerificationStatus;
  verificationOrigin?: VerificationOrigin;
  searchDiscoveryStatus?: "SEARCH_DISCOVERED";
  searchDiscoveredAt?: string;
  contentExtractionStatus?: "CONTENT_EXTRACTED" | "EXTRACTION_FAILED" | "INSUFFICIENT_TEXT" | "NOT_RUN";
  contentExtractedAt?: string;
  extractionFailureReason?: string;
  redirectCount?: number;
  verificationErrorCode?: string;
  origin?: SourceOrigin;
  provider?: SearchProviderRecord | "USER" | "ADMIN" | "LEGACY";
  providerRequestId?: string | null;
  searchRequestId?: string | null;
  evidenceAvailability?: EvidenceAvailability;
  sourceType?: SourceRecordType;
  modelSuggestedStrength?: DemandSignalStrength;
  finalEvidenceStrength?: DemandSignalStrength;
  evidenceEligibility?: EvidenceEligibility;
  hardRuleReasonCodes?: EvidenceReasonCode[];
  qualifyingExcerpt?: string;
  qualifyingSignals?: string[];
  paymentSignalLevel?: PaymentSignalLevel;
  marketScope?: MarketScope;
  contentHash?: string;
  discussionClusterKey?: string;
  promptInjectionDetected?: boolean;
  httpStatus?: number | null;
  contentType?: string;
  checkedAt?: string | null;
  durationMs?: number | null;
  rawContent?: string;
  extractedText?: string;
  signalStrength?: DemandSignalStrength;
  painPoint?: string;
  targetUser?: string;
  userQuoteOrSummary?: string;
  whyThisSignal?: string;
  whyRejected?: string;
  relevanceScore?: number;
  failureReason?: string;
};

export type SearchAdapter = {
  provider: SearchProvider;
  search(query: string): Promise<SearchResult[]>;
};

export type SearchProvider =
  | "manual_paste"
  | "placeholder_search"
  | "kimi"
  | "bocha"
  | "tavily"
  | "brave"
  | "exa"
  | "perplexity_search"
  | SearchProviderRecord;

export type EvidenceScoreBreakdown = {
  relevance: number;
  painReality: number;
  targetClarity: number;
  mvpMapping: number;
};

export type EvidenceSource = {
  id: string;
  title: string;
  url?: string;
  platform: string;
  subreddit?: string;
  sourceText: string;
  painPoint: string;
  targetUser: string;
  existingAlternative?: string;
  userQuoteOrSummary?: string;
  whyThisIsDemand?: string;
  evidenceStrength: EvidenceStrength;
  relevanceScore: number;
  scoreBreakdown?: EvidenceScoreBreakdown;
  sourceVerification?: {
    isExternalVerified: boolean;
    statusCode?: number;
    failureReason?: string;
  };
  modelSuggestedStrength?: EvidenceStrength;
  finalEvidenceStrength?: EvidenceStrength | "irrelevant";
  evidenceEligibility?: EvidenceEligibility;
  hardRuleReasonCodes?: EvidenceReasonCode[];
  qualifyingExcerpt?: string;
  qualifyingSignals?: string[];
};

export type ProductOpportunity = {
  id: string;
  productName: string;
  oneSentence: string;
  targetUser: string;
  painPoint: string;
  sourceEvidenceIds: string[];
  mvp: string;
  firstStep: string;
  monetization: string;
  chinaFit: string;
  difficulty: Difficulty;
  evidenceScore: number;
  risks: string[];
  whyNotGeneric: string;
};

export type Opportunity = {
  id: string;
  productName: string;
  oneSentence: string;
  targetUser: string;
  compressedFromOriginalIdea: string;
  painPoint: string;
  mvpOnly: string;
  doNotBuildYet: string[];
  firstThreeDaysBuildPlan: string[];
  firstValidationAction: string;
  monetization: string;
  chinaFit: string;
  biggestRisk: string;
  sourceIds: string[];
  score: number;
};

export type TodayActionMode = "EVIDENCE_BASED" | "HYPOTHESIS_VALIDATION";

export type TodayActionConfidence = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH";

export type TodayAction = {
  mode: TodayActionMode;
  title: string;
  description: string;
  targetUserSearch: {
    keywords: string[];
    platforms: string[];
    whyTheseKeywords: string;
  };
  tasks: {
    task: string;
    purpose: string;
    evidenceSourceIds: string[];
  }[];
  successMetric: {
    metric: string;
    reasoning: string;
  };
  stopCondition: {
    condition: string;
    reasoning: string;
  };
  outreachScript: {
    publicComment: string;
    directMessage: string;
  };
  evidenceSummary: {
    confirmedContentCount: number;
    independentEvidenceCount: number;
    sourceTitles: string[];
    reasoning: string[];
    confidence: TodayActionConfidence;
  };
  evidenceSourceIds: string[];
};

export type IdeaJudgment = {
  judgmentId?: string;
  reportCode?: string;
  recoveryUrl?: string;
  originalIdea: string;
  clarifiedIdea?: string;
  interpretedIdea: string;
  technicalOutcome?: TechnicalOutcome;
  marketVerdict?: MarketVerdict;
  confidence?: JudgmentConfidence;
  verdict: VerdictType;
  verdictText: string;
  verdictReason: string;
  scores: JudgmentScore;
  dimensions?: JudgmentDimension[];
  canShowOverallScore?: boolean;
  independentEvidenceCount?: number;
  independentDiscussionCount?: number;
  qualifyingIndependentEvidenceCount?: number;
  qualifyingUserEvidenceCount?: number;
  userEvidenceCandidateCount?: number;
  backgroundSourceCount?: number;
  commercialSourceCount?: number;
  verificationCoveragePercent?: number;
  domesticSignalCount?: number;
  overseasSignalCount?: number;
  paymentSignalLevel?: PaymentSignalLevel;
  marketTransferability?: {
    domesticFit: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
    overseasFit: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
    notes: string[];
  };
  searchQueries: string[];
  scannedSources: ScannedSource[];
  accessibleSources: ScannedSource[];
  inaccessibleSources: ScannedSource[];
  strongSignals: ScannedSource[];
  mediumSignals: ScannedSource[];
  weakSignals: ScannedSource[];
  irrelevantSources: ScannedSource[];
  opportunities: Opportunity[];
  todayAction: TodayAction;
  warnings: string[];
  verificationCoverage?: VerificationCoverage;
  partialVerificationWarning?: string;
  paymentStatus?: PaymentStatus;
  generationStatus?: GenerationStatus;
  deliveryStatus?: DeliveryStatus;
  generationError?: string | null;
  deepDiveMode?: DeepDiveMode | null;
  deepDiveOffer?: DeepDiveEligibility;
  reportGenerationEligibility?: ReportGenerationEligibility;
  scanStats?: {
    queryCount: number;
    candidateCount: number;
    deduplicatedCandidateCount?: number;
    checkedCount: number;
    totalCount: number;
    accessibleCount: number;
    inaccessibleCount: number;
    blockedCount?: number;
    rateLimitedCount?: number;
    notFoundCount?: number;
    timeoutCount?: number;
    networkErrorCount?: number;
    unsupportedContentCount?: number;
    invalidUrlCount?: number;
    unverifiedCount?: number;
    cacheHitCount?: number;
    networkRequestCount?: number;
    classifiedCount: number;
    strongCount: number;
    mediumCount: number;
    weakCount: number;
    irrelevantCount: number;
    opportunityCount: number;
  };
};

export type DeepDiveEligibility = {
  canGenerate: boolean;
  mode: DeepDiveMode | null;
  reason: string;
  blockers: string[];
  evidenceStats: {
    confirmedContentCount: number;
    independentEvidenceCount: number;
    strongOrMediumCount: number;
  };
};

export type ReportGenerationBlockingReason =
  | "NONE"
  | "GENERATION_API_NOT_CONNECTED"
  | "GENERATION_API_INVALID"
  | "GENERATION_API_EXPIRED"
  | "MODEL_UNSUPPORTED"
  | "SEARCH_API_NOT_CONNECTED"
  | "SEARCH_API_INVALID"
  | "SEARCH_API_EXPIRED"
  | "WORKER_UNAVAILABLE"
  | "DATABASE_UNAVAILABLE"
  | "SYSTEM_UNAVAILABLE";

export type ReportGenerationEligibility = {
  eligible: boolean;
  reportMode: DeepDiveMode | null;
  generationCredentialRequired: true;
  generationCredentialReady: boolean;
  searchCredentialRequired: boolean;
  searchCredentialReady: boolean;
  blockingReason: ReportGenerationBlockingReason;
  reason: string;
  evidenceStats: DeepDiveEligibility["evidenceStats"];
};

export type JudgmentDimension = {
  key:
    | "evidence_strength"
    | "payment_signal"
    | "beginner_feasibility"
    | "mvp_simplicity"
    | "distribution_access"
    | "domestic_fit"
    | "independence";
  label: string;
  value: number | null;
  confidence: JudgmentConfidence;
  note: string;
};

export type JobEventPayload =
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
  | { type: "signal_classified"; classifiedCount: number; strongCount: number; mediumCount: number; weakCount: number; irrelevantCount: number }
  | { type: "opportunities_generated"; opportunityCount: number }
  | { type: "report_saved"; judgmentId: string; reportCode: string; recoveryUrl?: string }
  | { type: "deep_dive_ready"; reportId: string; reportUrl: string; mode: DeepDiveMode }
  | { type: "completed"; result?: IdeaJudgment; judgmentId?: string }
  | { type: "retry_scheduled"; stage: string; message: string; code: string; nextAttemptAt: string; attemptCount: number; maxAttempts: number }
  | { type: "recovered_stale_job"; stage: string; message: string; code: "RECOVERED_STALE_JOB"; nextStatus: "QUEUED" | "FAILED" }
  | { type: "error"; stage: string; message: string; code?: string };

export type EvidenceExecutionReport = {
  mode: "EVIDENCE_EXECUTION";
  judgmentId: string;
  recommendation: {
    selectedOpportunityId?: string;
    productName: string;
    oneSentence: string;
    whyThisOne: string;
    whyNotTheOthers: {
      opportunityName: string;
      reason: string;
    }[];
    confidence: "low" | "medium" | "high";
  };
  targetUser: {
    description: string;
    specificScene: string;
    currentAlternative: string;
    alternativeProblem: string;
  };
  mvpPlan: {
    goal: string;
    productForm: string;
    estimatedBuildTime: string;
    pages: {
      pageName: string;
      purpose: string;
      sections: string[];
    }[];
    coreInputs: string[];
    coreOutputs: string[];
    userFlow: string[];
    techStack: string[];
    manualDeliveryOption: string;
    doNotBuildYet: string[];
  };
  firstUserMap: {
    platforms: {
      platform: string;
      reason: string;
      searchKeywords: string[];
      targetPostSignals: string[];
      nonTargetSignals: string[];
    }[];
    totalPeopleToContact: number;
  };
  outreachScripts: {
    publicComment: string;
    directMessage: string;
    followUp: string;
    paymentTest: string;
  };
  todayAction: {
    title: string;
    tasks: string[];
    expectedOutput: string;
    successMetric: string;
    stopCondition: string;
  };
  threeDayValidationPlan: {
    day: number;
    objective: string;
    tasks: string[];
    output: string;
    successMetric: string;
    stopCondition: string;
  }[];
  pricingTest: {
    freeTestOffer: string;
    firstPaidOffer: string;
    suggestedPrice: string;
    questionToAsk: string;
    validPaymentSignal: string;
    invalidPaymentSignal: string;
  };
  risks: {
    risk: string;
    whyItMatters: string;
    mitigation: string;
  }[];
  finalStopConditions: string[];
  codexPrompt: string;
  evidenceSourceIds: string[];
  generatedAt: string;
};

export type IdeaSignalRepairReport = {
  mode: "IDEA_SIGNAL_REPAIR";
  judgmentId: string;
  title: string;
  disclaimer: string;
  currentVerdict: {
    technicalOutcome: TechnicalOutcome;
    marketVerdict: MarketVerdict;
    whyNotValidated: string;
  };
  evidenceGapMap: {
    gap: string;
    whyItMatters: string;
    howToFill: string;
  }[];
  reconstructedHypotheses: {
    targetUser: string;
    painHypothesis: string;
    riskyAssumption: string;
    validationSignal: string;
  }[];
  searchPlan: {
    platform: string;
    queries: string[];
    targetSignals: string[];
    rejectSignals: string[];
  }[];
  interviewPlan: {
    whoToAsk: string;
    questions: string[];
    validAnswers: string[];
    invalidAnswers: string[];
  };
  manualDeliveryTest: {
    offer: string;
    deliverySteps: string[];
    presaleScript: string;
    validPaymentSignal: string;
    invalidPaymentSignal: string;
  };
  threeDayRepairPlan: {
    day: number;
    objective: string;
    tasks: string[];
    output: string;
    continueIf: string;
    stopIf: string;
  }[];
  finalDecisionRules: {
    continueRules: string[];
    stopRules: string[];
    reframeRules: string[];
  };
  codexPrompt: string;
  evidenceSourceIds: string[];
  generatedAt: string;
};

export type DeepDiveReport = EvidenceExecutionReport | IdeaSignalRepairReport;

export type ClarificationResponse = {
  status: "needs_clarification";
  questions: {
    id: "targetUser" | "painfulScene" | "productForm";
    question: string;
    placeholder: string;
  }[];
};

export type SourceVerificationSummary = {
  totalSearchResults: number;
  verifiedSources: number;
  invalidSources: number;
  validEvidence: number;
  canGenerateOpportunities: boolean;
  strongSignals?: number;
  mediumSignals?: number;
  weakSignals?: number;
  irrelevantSources?: number;
  manualPasteUnverified?: boolean;
  devMock?: boolean;
};

export type AnalyzeResponse = {
  status: AnalyzeStatus;
  message?: string;
  originalIdea: string;
  interpretedIdea: InterpretedIdea;
  searchQueries: string[];
  scannedSources: ScannedSource[];
  accessibleSources: ScannedSource[];
  inaccessibleSources: ScannedSource[];
  strongSignals: ScannedSource[];
  mediumSignals: ScannedSource[];
  weakSignals: ScannedSource[];
  irrelevantSources: ScannedSource[];
  evidence: EvidenceSource[];
  opportunities: ProductOpportunity[];
  canGenerateOpportunities: boolean;
  stopReason?: string;
  warnings: string[];
  sourceVerification: SourceVerificationSummary;
  meta: {
    mode: AnalyzeMode;
    market: "china";
    userLevel: UserLevel;
    searchProvider: SearchProvider;
    usedKimi: boolean;
  };
};
