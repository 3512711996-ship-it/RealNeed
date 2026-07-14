import type { DemandSignalStrength, EvidenceEligibility, EvidenceReasonCode, ScannedSource, SourceRecordType } from "@/lib/types";

const eligibleUserTypes = new Set<SourceRecordType>([
  "USER_DISCUSSION",
  "USER_REVIEW",
  "QUESTION_ANSWER",
  "SUPPORT_REQUEST",
  "COMMUNITY_POST",
  "USER_COMPLAINT"
]);

const commercialTypes = new Set<SourceRecordType>([
  "PAID_SERVICE",
  "OFFICIAL_PRODUCT_PAGE",
  "COMMERCIAL_PROMOTION",
  "SEO_ARTICLE",
  "TUTORIAL",
  "NEWS_ARTICLE",
  "MEDIA_REVIEW",
  "TOOL_COMPARISON",
  "AFFILIATE_PAGE",
  "MARKET_REPORT_SUMMARY",
  "VENDOR_DOCUMENTATION",
  "LANDING_PAGE"
]);

const competitorTypes = new Set<SourceRecordType>(["MARKETPLACE_LISTING", "TOOL_COMPARISON", "OFFICIAL_PRODUCT_PAGE", "PAID_SERVICE"]);

export type EvidencePolicyDecision = {
  modelSuggestedStrength: DemandSignalStrength;
  finalEvidenceStrength: DemandSignalStrength;
  evidenceEligibility: EvidenceEligibility;
  hardRuleReasonCodes: EvidenceReasonCode[];
  qualifyingExcerpt?: string;
  qualifyingSignals: string[];
};

export function applyEvidenceHardRules(source: ScannedSource): EvidencePolicyDecision {
  const modelSuggestedStrength = source.modelSuggestedStrength ?? source.signalStrength ?? "irrelevant";
  const sourceType = source.sourceType ?? "UNKNOWN";
  const isManual = source.origin === "USER_PASTED";
  const directVerified = source.verificationStatus === "ACCESSIBLE" || source.verificationStatus === "REDIRECTED_ACCESSIBLE";
  const contentConfirmed = source.evidenceAvailability === "CONFIRMED_CONTENT" || isManual;
  const reasons: EvidenceReasonCode[] = [];
  const signals: string[] = [];
  const excerpt = cleanExcerpt(source.qualifyingExcerpt ?? source.userQuoteOrSummary);
  const text = normalizeText(`${source.title} ${source.extractedText ?? ""} ${excerpt ?? ""} ${source.painPoint ?? ""} ${source.targetUser ?? ""}`);

  if (!isManual && !directVerified) reasons.push("DIRECT_VERIFICATION_REQUIRED");
  if (!contentConfirmed) reasons.push("CONTENT_EXTRACTION_REQUIRED");
  if (source.promptInjectionDetected) reasons.push("PROMPT_INJECTION_DETECTED");
  if ((source.relevanceScore ?? 0) < 50) reasons.push("LOW_RELEVANCE");

  if (!eligibleUserTypes.has(sourceType)) {
    reasons.push("NON_USER_SOURCE");
    if (commercialTypes.has(sourceType)) reasons.push("COMMERCIAL_CONTENT");
    if (sourceType === "OFFICIAL_PRODUCT_PAGE" || sourceType === "VENDOR_DOCUMENTATION" || sourceType === "LANDING_PAGE") reasons.push("OFFICIAL_CONTENT");
    if (sourceType === "NEWS_ARTICLE" || sourceType === "MEDIA_REVIEW" || sourceType === "TOOL_COMPARISON") reasons.push("MEDIA_CONTENT");
    reasons.push("BACKGROUND_INFORMATION_ONLY");
  }

  if (!excerpt || !excerptComesFromSource(excerpt, source.extractedText ?? source.rawContent ?? "")) {
    reasons.push("NO_QUALIFYING_EXCERPT");
  }

  const concreteUser = hasConcreteUser(text, sourceType, source.targetUser);
  const concreteScenario = hasConcreteScenario(text);
  const concreteProblem = hasConcreteProblem(text);

  if (concreteUser) signals.push("CONCRETE_USER");
  else reasons.push("NO_CONCRETE_USER");

  if (concreteScenario) signals.push("CONCRETE_SCENARIO");
  else reasons.push("NO_CONCRETE_SCENARIO");

  if (concreteProblem) signals.push("CONCRETE_PROBLEM");
  else reasons.push("KEYWORD_ONLY_MATCH");

  if (hasRepeatedProblem(text)) signals.push("REPEATED_PROBLEM");
  if (hasActiveSearch(text)) signals.push("ACTIVE_SOLUTION_SEARCH");
  if (hasWorkaround(text)) signals.push("WORKAROUND");
  if (hasLoss(text)) signals.push("MEASURABLE_LOSS");

  const uniqueReasons = Array.from(new Set(reasons));
  const uniqueSignals = Array.from(new Set(signals));
  const isTraceable = isManual || directVerified;
  const baselineEligible =
    eligibleUserTypes.has(sourceType) &&
    isTraceable &&
    contentConfirmed &&
    !source.promptInjectionDetected &&
    (source.relevanceScore ?? 0) >= 50 &&
    Boolean(excerpt) &&
    !uniqueReasons.includes("NO_QUALIFYING_EXCERPT") &&
    concreteUser &&
    concreteScenario &&
    concreteProblem;

  if (!isTraceable || !contentConfirmed) {
    return decision(modelSuggestedStrength, "weak", "UNVERIFIED", uniqueReasons, undefined, uniqueSignals);
  }

  if ((source.relevanceScore ?? 0) < 50) {
    return decision(modelSuggestedStrength, "irrelevant", "IRRELEVANT", uniqueReasons, undefined, uniqueSignals);
  }

  if (!eligibleUserTypes.has(sourceType)) {
    const eligibility: EvidenceEligibility = competitorTypes.has(sourceType) ? "COMPETITOR_ONLY" : "BACKGROUND_ONLY";
    return decision(modelSuggestedStrength, modelSuggestedStrength === "irrelevant" ? "irrelevant" : "weak", eligibility, uniqueReasons, undefined, uniqueSignals);
  }

  if (!baselineEligible) {
    return decision(modelSuggestedStrength, "weak", "BACKGROUND_ONLY", uniqueReasons, undefined, uniqueSignals);
  }

  const strongBehaviorSignals = uniqueSignals.filter((signal) =>
    ["REPEATED_PROBLEM", "ACTIVE_SOLUTION_SEARCH", "WORKAROUND", "MEASURABLE_LOSS"].includes(signal)
  ).length;
  const finalEvidenceStrength: DemandSignalStrength =
    modelSuggestedStrength === "strong" && strongBehaviorSignals >= 2 && !isManual ? "strong" : modelSuggestedStrength === "strong" || modelSuggestedStrength === "medium" ? "medium" : "weak";

  if (finalEvidenceStrength === "weak") {
    return decision(modelSuggestedStrength, "weak", "BACKGROUND_ONLY", [...uniqueReasons, "KEYWORD_ONLY_MATCH"], undefined, uniqueSignals);
  }

  return decision(modelSuggestedStrength, finalEvidenceStrength, "ELIGIBLE_USER_EVIDENCE", uniqueReasons, excerpt, uniqueSignals);
}

export function isQualifyingEvidenceSource(source: ScannedSource) {
  return (
    source.evidenceEligibility === "ELIGIBLE_USER_EVIDENCE" &&
    (source.finalEvidenceStrength === "strong" || source.finalEvidenceStrength === "medium") &&
    Boolean(source.qualifyingExcerpt) &&
    source.origin !== "UNTRUSTED_LEGACY_SOURCE"
  );
}

export function isEligibleUserSourceType(sourceType: SourceRecordType | undefined) {
  return Boolean(sourceType && eligibleUserTypes.has(sourceType));
}

export function isCommercialSourceType(sourceType: SourceRecordType | undefined) {
  return Boolean(sourceType && commercialTypes.has(sourceType));
}

function decision(
  modelSuggestedStrength: DemandSignalStrength,
  finalEvidenceStrength: DemandSignalStrength,
  evidenceEligibility: EvidenceEligibility,
  hardRuleReasonCodes: EvidenceReasonCode[],
  qualifyingExcerpt: string | undefined,
  qualifyingSignals: string[]
): EvidencePolicyDecision {
  return {
    modelSuggestedStrength,
    finalEvidenceStrength,
    evidenceEligibility,
    hardRuleReasonCodes: Array.from(new Set(hardRuleReasonCodes)),
    qualifyingExcerpt,
    qualifyingSignals
  };
}

function cleanExcerpt(value?: string) {
  const clean = value?.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, 1200) : undefined;
}

function excerptComesFromSource(excerpt: string, sourceText: string) {
  const normalizedExcerpt = normalizeText(excerpt);
  const normalizedSource = normalizeText(sourceText);
  if (normalizedExcerpt.length < 8) return false;
  if (normalizedSource.includes(normalizedExcerpt)) return true;
  const tokens = Array.from(new Set(excerpt.match(/[A-Za-z0-9]+|[\u4e00-\u9fff]{2,}/g) ?? [])).filter((token) => token.length >= 4);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((token) => normalizedSource.includes(normalizeText(token))).length;
  return hits / tokens.length >= 0.65;
}

function hasConcreteUser(text: string, sourceType: SourceRecordType, targetUser?: string) {
  if (/\b(i|i'm|i’ve|i've|my|we|our|me)\b|我|我们|本人|用户|客户|学生|自由职业|店主|开发者|收藏者/.test(text)) return true;
  return sourceType === "USER_REVIEW" && Boolean(targetUser && !/用户|大众|人群/.test(targetUser));
}

function hasConcreteScenario(text: string) {
  return /\b(when|whenever|every day|every week|each time|during|after|before|currently|right now|last month|workflow|process)\b|每次|每天|每周|月底|工作时|使用时|最近|目前|现在|流程|手动|表格|excel|notion|spreadsheet/.test(text);
}

function hasConcreteProblem(text: string) {
  return /\b(hate|tired of|struggling|frustrat|annoying|too complicated|takes too much time|waste time|can't|cannot|problem|pain point)\b|麻烦|不好用|太复杂|太难|耗时|浪费时间|重复|卡住|抱怨|吐槽|求助/.test(text);
}

function hasRepeatedProblem(text: string) {
  return /\b(always|every|repeated|again and again|constantly|daily|weekly|each time)\b|总是|每次|每天|每周|反复|重复|经常/.test(text);
}

function hasActiveSearch(text: string) {
  return /\b(looking for|is there a tool|recommend|alternative|what do you use|need a tool|willing to pay)\b|求推荐|有没有工具|寻找|替代方案|愿意付费/.test(text);
}

function hasWorkaround(text: string) {
  return /\b(manual|spreadsheet|excel|notion|copy and paste|workaround)\b|手动|表格|复制粘贴|笨办法|暂时用/.test(text);
}

function hasLoss(text: string) {
  return /\b(hours?|days?|cost|expensive|lost|waste|missed|delay)\b|小时|天|成本|太贵|损失|耽误|错过|浪费/.test(text);
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

