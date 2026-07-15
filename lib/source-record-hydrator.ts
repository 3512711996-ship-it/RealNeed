import type { SourceRecord } from "@prisma/client";
import { enrichJudgmentTrust } from "@/lib/trust-analysis";
import type { EvidenceReasonCode, IdeaJudgment, ScannedSource } from "@/lib/types";

type PersistedSourceAudit = Pick<
  SourceRecord,
  | "sourceDisplayId"
  | "origin"
  | "evidenceAvailability"
  | "originalUrl"
  | "normalizedUrl"
  | "canonicalUrl"
  | "accessStatus"
  | "httpStatus"
  | "verificationOrigin"
  | "checkedAt"
  | "durationMs"
  | "contentType"
  | "failureReason"
  | "redirectCount"
  | "verificationErrorCode"
  | "searchDiscoveredAt"
  | "contentExtractedAt"
  | "contentExtractionStatus"
  | "extractionFailureReason"
  | "sourceType"
  | "evidenceStrength"
  | "modelSuggestedStrength"
  | "finalEvidenceStrength"
  | "evidenceEligibility"
  | "hardRuleReasonCodes"
  | "qualifyingExcerpt"
  | "qualifyingSignals"
>;

export function hydrateJudgmentSourceAudit(judgment: IdeaJudgment, records: PersistedSourceAudit[]): IdeaJudgment {
  const scannedSources = Array.isArray(judgment.scannedSources) ? judgment.scannedSources : [];
  const warnings = Array.isArray(judgment.warnings) ? judgment.warnings : [];

  if (records.length === 0) {
    return {
      ...judgment,
      scannedSources,
      warnings
    };
  }

  const byDisplayId = new Map(records.filter((record) => record.sourceDisplayId).map((record) => [record.sourceDisplayId as string, record]));
  const byUrl = new Map(records.map((record) => [normalize(record.originalUrl), record]));
  const hydrateList = (sources: ScannedSource[]) => sources.map((source) => hydrateSource(source, byDisplayId.get(source.sourceDisplayId ?? source.id) ?? byUrl.get(normalize(source.url))));

  const verificationCoverage = hydrateCoverage(judgment.verificationCoverage, records);
  const hasUnverifiedDirectSources = records.some((record) => record.origin === "SEARCH_PROVIDER" && record.accessStatus === "UNVERIFIED");
  const hydratedWarnings = warnings.filter((warning) => !warning.includes("来源验证达到时间上限") && !warning.includes("未完成的来源已标记为待验证"));
  if (hasUnverifiedDirectSources) {
    hydratedWarnings.push("部分来源尚未执行独立直接 URL 验证；它们保留为搜索线索，但不计入正式证据。");
  }

  return enrichJudgmentTrust({
    ...judgment,
    scannedSources: hydrateList(scannedSources),
    verificationCoverage,
    partialVerificationWarning: hasUnverifiedDirectSources
      ? "部分来源尚未执行独立直接验证；这不代表链接失效，但当前不能计入正式证据。"
      : undefined,
    warnings: Array.from(new Set(hydratedWarnings))
  });
}

function hydrateCoverage(coverage: IdeaJudgment["verificationCoverage"], records: PersistedSourceAudit[]) {
  if (!coverage) return coverage;
  const direct = records.filter((record) => record.origin === "SEARCH_PROVIDER");
  const count = (...statuses: PersistedSourceAudit["accessStatus"][]) => direct.filter((record) => statuses.includes(record.accessStatus)).length;
  const accessibleCount = count("ACCESSIBLE", "REDIRECTED_ACCESSIBLE");
  const unverifiedCount = count("UNVERIFIED");
  const completedCount = Math.max(0, direct.length - unverifiedCount);
  const measuredDurations = direct.map((record) => record.durationMs).filter((value): value is number => typeof value === "number");
  const directDuration = measuredDurations.length > 0 ? Math.max(...measuredDurations) : null;
  const directStarted = direct.map((record) => record.checkedAt?.getTime()).filter((value): value is number => typeof value === "number");
  const directStage = directStarted.length
    ? {
        startedAt: new Date(Math.min(...directStarted)).toISOString(),
        completedAt: new Date(Math.max(...directStarted)).toISOString(),
        durationMs: directDuration,
        attemptedCount: direct.length,
        succeededCount: accessibleCount,
        failedCount: Math.max(0, completedCount - accessibleCount),
        timeoutCount: count("TIMEOUT"),
        blockedCount: count("BLOCKED", "REDIRECT_BLOCKED"),
        rateLimitedCount: count("RATE_LIMITED")
      }
    : {
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

  return {
    ...coverage,
    completedCount,
    accessibleCount,
    directVerifiedCount: accessibleCount,
    blockedCount: count("BLOCKED", "REDIRECT_BLOCKED"),
    rateLimitedCount: count("RATE_LIMITED"),
    notFoundCount: count("NOT_FOUND"),
    timeoutCount: count("TIMEOUT"),
    networkErrorCount: count("NETWORK_ERROR"),
    unsupportedContentCount: count("UNSUPPORTED_CONTENT", "BODY_TOO_LARGE"),
    invalidUrlCount: count("INVALID_URL"),
    unverifiedCount,
    durationMs: directDuration,
    partial: unverifiedCount > 0,
    directVerificationStage: directStage
  };
}

function hydrateSource(source: ScannedSource, record?: PersistedSourceAudit): ScannedSource {
  if (!record) return source;
  const directlyAccessible = record.accessStatus === "ACCESSIBLE" || record.accessStatus === "REDIRECTED_ACCESSIBLE";

  return {
    ...source,
    sourceDisplayId: record.sourceDisplayId ?? source.sourceDisplayId,
    url: record.originalUrl || source.url,
    normalizedUrl: record.normalizedUrl ?? source.normalizedUrl,
    finalUrl: record.canonicalUrl ?? source.finalUrl,
    isAccessible: directlyAccessible,
    statusCode: record.httpStatus,
    httpStatus: record.httpStatus,
    verificationStatus: record.accessStatus,
    verificationOrigin: asVerificationOrigin(record.verificationOrigin),
    checkedAt: record.checkedAt?.toISOString() ?? null,
    durationMs: record.durationMs,
    contentType: record.contentType ?? source.contentType,
    failureReason: record.failureReason ?? source.failureReason,
    redirectCount: record.redirectCount,
    verificationErrorCode: record.verificationErrorCode ?? undefined,
    searchDiscoveryStatus: record.searchDiscoveredAt ? "SEARCH_DISCOVERED" : source.searchDiscoveryStatus,
    searchDiscoveredAt: record.searchDiscoveredAt?.toISOString() ?? source.searchDiscoveredAt,
    contentExtractionStatus: asExtractionStatus(record.contentExtractionStatus) ?? source.contentExtractionStatus,
    contentExtractedAt: record.contentExtractedAt?.toISOString() ?? source.contentExtractedAt,
    extractionFailureReason: record.extractionFailureReason ?? source.extractionFailureReason,
    sourceType: record.sourceType,
    signalStrength: recordStrength(record.finalEvidenceStrength),
    modelSuggestedStrength: recordStrength(record.modelSuggestedStrength),
    finalEvidenceStrength: recordStrength(record.finalEvidenceStrength),
    evidenceEligibility: record.evidenceEligibility,
    hardRuleReasonCodes: jsonStringArray(record.hardRuleReasonCodes) as EvidenceReasonCode[],
    qualifyingExcerpt: record.qualifyingExcerpt ?? undefined,
    qualifyingSignals: jsonStringArray(record.qualifyingSignals)
  };
}

function normalize(value: string) {
  return value.trim().replace(/\/$/, "").toLowerCase();
}

function asVerificationOrigin(value: string | null) {
  return value === "CACHE" || value === "LIVE" || value === "MANUAL" || value === "REDDIT_PUBLIC_JSON" ? value : undefined;
}

function asExtractionStatus(value: string | null): ScannedSource["contentExtractionStatus"] | undefined {
  if (value === "CONTENT_EXTRACTED" || value === "EXTRACTION_FAILED" || value === "INSUFFICIENT_TEXT" || value === "NOT_RUN") return value;
  return undefined;
}

function recordStrength(value: PersistedSourceAudit["finalEvidenceStrength"]): ScannedSource["signalStrength"] {
  if (value === "STRONG") return "strong";
  if (value === "MEDIUM") return "medium";
  if (value === "WEAK") return "weak";
  if (value === "IRRELEVANT") return "irrelevant";
  return undefined;
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
