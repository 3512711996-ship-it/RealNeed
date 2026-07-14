import type { Prisma } from "@prisma/client";
import { getServerEnv } from "@/lib/env";
import { generateOpaqueToken, hashToken, buildRecoveryUrl } from "@/lib/crypto-tokens";
import { buildDeepDiveEligibility } from "@/lib/deep-dive-eligibility";
import { prisma } from "@/lib/prisma";
import { generateReportCode } from "@/lib/report-code";
import { assertTrustedSourceOrigin } from "@/lib/source-origin";
import { enrichJudgmentTrust } from "@/lib/trust-analysis";
import { isQualifyingEvidenceSource } from "@/lib/evidence-policy";
import type { IdeaJudgment, ScannedSource } from "@/lib/types";

export async function createPendingJudgmentRecord(input: { originalIdea: string; interpretedIdea?: string }) {
  const env = getServerEnv();
  const reportCode = await generateReportCode();
  const recoveryToken = generateOpaqueToken("rn_recover");
  const expiresAt = new Date(Date.now() + env.reportRetentionDays * 24 * 60 * 60 * 1000);

  const record = await prisma.ideaJudgmentRecord.create({
    data: {
      reportCode,
      recoveryTokenHash: hashToken(recoveryToken),
      originalIdea: input.originalIdea,
      interpretedIdea: input.interpretedIdea,
      judgmentJson: toJson({
        originalIdea: input.originalIdea,
        reportCode,
        technicalOutcome: "PROCESSING_FAILED",
        marketVerdict: "NOT_AVAILABLE",
        confidence: "VERY_LOW",
        warnings: ["报告仍在后台处理中。"]
      }),
      technicalOutcome: "PROCESSING_FAILED",
      marketVerdict: "NOT_AVAILABLE",
      confidence: "VERY_LOW",
      expiresAt
    },
    select: {
      id: true,
      reportCode: true
    }
  });

  return {
    judgmentId: record.id,
    reportCode: record.reportCode,
    recoveryToken,
    recoveryUrl: buildRecoveryUrl(recoveryToken)
  };
}

export async function saveIdeaJudgment(
  judgment: IdeaJudgment,
  options: {
    existingId?: string;
    recoveryToken?: string;
  } = {}
) {
  const reportCode = judgment.reportCode ?? (await generateReportCode());
  const trusted = enrichJudgmentTrust(judgment);
  const deepDiveOffer = buildDeepDiveEligibility(trusted);
  const withStats: IdeaJudgment = {
    ...trusted,
    reportCode,
    deepDiveOffer,
    paymentStatus: "UNPAID",
    generationStatus: "NOT_STARTED",
    deliveryStatus: "NOT_SENT",
    recoveryUrl: options.recoveryToken ? buildRecoveryUrl(options.recoveryToken) : trusted.recoveryUrl,
    scanStats: buildScanStats(judgment)
  };

  const record = options.existingId
    ? await prisma.ideaJudgmentRecord.update({
        where: { id: options.existingId },
        data: buildJudgmentRecordData(withStats, options.recoveryToken),
        select: { id: true, reportCode: true }
      })
    : await prisma.ideaJudgmentRecord.create({
        data: buildJudgmentRecordData(withStats, options.recoveryToken),
        select: { id: true, reportCode: true }
      });

  const saved: IdeaJudgment = {
    ...withStats,
    judgmentId: record.id,
    reportCode: record.reportCode
  };

  await prisma.ideaJudgmentRecord.update({
    where: { id: record.id },
    data: {
      judgmentJson: toJson(saved)
    }
  });

  await persistJudgmentSources(record.id, saved);

  return saved;
}

function buildJudgmentRecordData(judgment: IdeaJudgment, recoveryToken?: string): Prisma.IdeaJudgmentRecordUncheckedCreateInput {
  const env = getServerEnv();
  const expiresAt = new Date(Date.now() + env.reportRetentionDays * 24 * 60 * 60 * 1000);

  return {
    reportCode: judgment.reportCode as string,
    recoveryTokenHash: recoveryToken ? hashToken(recoveryToken) : undefined,
    originalIdea: judgment.originalIdea,
    interpretedIdea: judgment.interpretedIdea,
    judgmentJson: toJson(judgment),
    deepDiveEligibilityJson: toJson(judgment.deepDiveOffer ?? buildDeepDiveEligibility(judgment)),
    technicalOutcome: judgment.technicalOutcome ?? "PROCESSING_FAILED",
    marketVerdict: judgment.marketVerdict ?? "NOT_AVAILABLE",
    confidence: judgment.confidence ?? "VERY_LOW",
    paymentStatus: "UNPAID",
    generationStatus: "NOT_STARTED",
    deliveryStatus: "NOT_SENT",
    expiresAt
  };
}

async function persistJudgmentSources(judgmentId: string, judgment: IdeaJudgment) {
  await prisma.$transaction(async (tx) => {
    await tx.sourceRecord.deleteMany({ where: { judgmentId } });
    await tx.evidenceCluster.deleteMany({ where: { judgmentId } });

    const clusterMap = new Map<string, string>();
    const clusterCounts = countClusters(judgment.scannedSources);

    for (const [canonicalKey, clusterInfo] of clusterCounts) {
      const cluster = await tx.evidenceCluster.create({
        data: {
          judgmentId,
          clusterType: "SAME_THREAD",
          canonicalKey,
          sourceCount: clusterInfo.sourceCount,
          isQualifying: clusterInfo.isQualifying
        },
        select: { id: true }
      });
      clusterMap.set(canonicalKey, cluster.id);
    }

    for (const source of judgment.scannedSources) {
      assertTrustedSourceOrigin({
        ...source,
        origin: source.origin ?? (source.url ? "UNTRUSTED_LEGACY_SOURCE" : "USER_PASTED")
      });
      await tx.sourceRecord.create({
        data: {
          judgmentId,
          searchRequestId: source.searchRequestId ?? undefined,
          originalUrl: source.url || "manual://user-paste",
          normalizedUrl: source.normalizedUrl || undefined,
          canonicalUrl: source.finalUrl || source.normalizedUrl || source.url || undefined,
          host: getHost(source.finalUrl || source.normalizedUrl || source.url),
          origin: source.origin ?? (source.url ? "UNTRUSTED_LEGACY_SOURCE" : "USER_PASTED"),
          provider: source.provider,
          providerRequestId: source.providerRequestId ?? undefined,
          evidenceAvailability: source.evidenceAvailability ?? (source.isAccessible ? "CONFIRMED_CONTENT" : "NO_EVIDENCE"),
          sourceType: source.sourceType ?? "UNKNOWN",
          accessStatus: source.verificationStatus ?? (source.isAccessible ? "ACCESSIBLE" : "UNVERIFIED"),
          evidenceStrength: signalStrengthToRecordStrength(source.finalEvidenceStrength ?? source.signalStrength),
          modelSuggestedStrength: signalStrengthToRecordStrength(source.modelSuggestedStrength),
          finalEvidenceStrength: signalStrengthToRecordStrength(source.finalEvidenceStrength ?? source.signalStrength),
          evidenceEligibility: source.evidenceEligibility ?? "UNVERIFIED",
          hardRuleReasonCodes: toJson(source.hardRuleReasonCodes ?? []),
          qualifyingExcerpt: source.qualifyingExcerpt?.slice(0, 2000),
          qualifyingSignals: toJson(source.qualifyingSignals ?? []),
          paymentSignalLevel: source.paymentSignalLevel ?? "NONE",
          marketScope: source.marketScope ?? "UNKNOWN",
          verificationOrigin: source.verificationOrigin,
          httpStatus: source.statusCode ?? source.httpStatus,
          contentType: source.contentType,
          redirectCount: source.redirectCount ?? 0,
          verificationErrorCode: source.verificationErrorCode,
          searchDiscoveredAt: source.searchDiscoveredAt ? new Date(source.searchDiscoveredAt) : undefined,
          contentExtractedAt: source.contentExtractedAt ? new Date(source.contentExtractedAt) : undefined,
          contentExtractionStatus: source.contentExtractionStatus,
          extractionFailureReason: source.extractionFailureReason,
          title: source.title,
          rawContent: source.evidenceAvailability === "CONFIRMED_CONTENT" ? source.rawContent?.slice(0, 8000) : undefined,
          excerpt: source.extractedText?.slice(0, 2000) ?? source.userQuoteOrSummary?.slice(0, 1000),
          failureReason: source.failureReason,
          sourceAnomaly: source.origin ? undefined : "MISSING_ORIGIN",
          sourceDisplayId: source.sourceDisplayId ?? source.id,
          contentHash: source.contentHash,
          discussionClusterId: source.discussionClusterKey ? clusterMap.get(source.discussionClusterKey) : undefined,
          promptInjectionDetected: source.promptInjectionDetected ?? false,
          durationMs: source.durationMs,
          checkedAt: source.checkedAt ? new Date(source.checkedAt) : undefined,
          classifiedAt: source.signalStrength ? new Date() : undefined
        }
      });
    }
  });
}

function countClusters(sources: ScannedSource[]) {
  const counts = new Map<string, { sourceCount: number; isQualifying: boolean }>();
  for (const source of sources) {
    if (!source.discussionClusterKey) continue;
    const existing = counts.get(source.discussionClusterKey);
    counts.set(source.discussionClusterKey, {
      sourceCount: (existing?.sourceCount ?? 0) + 1,
      isQualifying: Boolean(existing?.isQualifying || isQualifyingEvidenceSource(source))
    });
  }
  return counts;
}

function signalStrengthToRecordStrength(strength: ScannedSource["signalStrength"]) {
  if (strength === "strong") return "STRONG";
  if (strength === "medium") return "MEDIUM";
  if (strength === "weak") return "WEAK";
  if (strength === "irrelevant") return "IRRELEVANT";
  return "NOT_CLASSIFIED";
}

function getHost(url: string | undefined) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function buildScanStats(judgment: IdeaJudgment): NonNullable<IdeaJudgment["scanStats"]> {
  const coverage = judgment.verificationCoverage;

  return {
    queryCount: judgment.searchQueries.length,
    candidateCount: coverage?.totalCandidates ?? judgment.scannedSources.length,
    deduplicatedCandidateCount: coverage?.deduplicatedCandidates,
    checkedCount: coverage?.completedCount ?? judgment.scannedSources.length,
    totalCount: coverage?.deduplicatedCandidates ?? judgment.scannedSources.length,
    accessibleCount: judgment.accessibleSources.length,
    inaccessibleCount: judgment.inaccessibleSources.length,
    blockedCount: coverage?.blockedCount,
    rateLimitedCount: coverage?.rateLimitedCount,
    notFoundCount: coverage?.notFoundCount,
    timeoutCount: coverage?.timeoutCount,
    networkErrorCount: coverage?.networkErrorCount,
    unsupportedContentCount: coverage?.unsupportedContentCount,
    invalidUrlCount: coverage?.invalidUrlCount,
    unverifiedCount: coverage?.unverifiedCount,
    cacheHitCount: coverage?.cacheHitCount,
    networkRequestCount: coverage?.networkRequestCount,
    classifiedCount: judgment.accessibleSources.length,
    strongCount: judgment.strongSignals.length,
    mediumCount: judgment.mediumSignals.length,
    weakCount: judgment.weakSignals.length,
    irrelevantCount: judgment.irrelevantSources.length,
    opportunityCount: judgment.opportunities.length
  };
}

export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
