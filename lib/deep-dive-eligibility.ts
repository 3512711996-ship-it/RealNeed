import { isQualifyingEvidenceSource } from "@/lib/evidence-policy";
import { enrichSourceRecord } from "@/lib/trust-analysis";
import type { DeepDiveEligibility, DeepDiveMode, IdeaJudgment, TechnicalOutcome } from "@/lib/types";

const repairableOutcomes = new Set<TechnicalOutcome>([
  "SEARCH_NOT_CONFIGURED",
  "NO_SEARCH_RESULTS",
  "EXTRACTION_INCOMPLETE",
  "VERIFICATION_INCOMPLETE",
  "SOURCES_BLOCKED",
  "INSUFFICIENT_EVIDENCE"
]);

const systemFailureOutcomes = new Set<TechnicalOutcome>([
  "SEARCH_FAILED",
  "ANALYSIS_FAILED",
  "DATABASE_FAILED",
  "PROCESSING_FAILED"
]);

/** Determines only which evidence-backed report mode is honest. It never checks payment. */
export function buildDeepDiveEligibility(judgment: IdeaJudgment, _legacyCapabilities?: unknown): DeepDiveEligibility {
  void _legacyCapabilities;
  const technicalOutcome = judgment.technicalOutcome ?? "READY";
  const marketVerdict = judgment.marketVerdict ?? judgment.verdict;
  const evidenceStats = buildEvidenceStats(judgment);
  if (technicalOutcome === "READY" && marketVerdict !== "NOT_AVAILABLE" && evidenceStats.independentEvidenceCount >= 2 && judgment.opportunities.length > 0) {
    return {
      canPurchase: true,
      mode: "EVIDENCE_EXECUTION",
      reason: "已找到足够独立证据，可以生成免费的证据型执行报告。",
      blockers: [],
      evidenceStats
    };
  }

  if (repairableOutcomes.has(technicalOutcome)) {
    return {
      canPurchase: true,
      mode: "IDEA_SIGNAL_REPAIR",
      reason:
        technicalOutcome === "SEARCH_NOT_CONFIGURED"
          ? "本次没有执行外部搜索验证，但系统可以生成想法补足型 Deep Dive，帮助你补齐证据。"
          : "本次没有找到足够可信需求证据，可以生成想法补足型 Deep Dive，帮助你继续补证而不是假装已验证。",
      blockers: [],
      evidenceStats
    };
  }

  if (systemFailureOutcomes.has(technicalOutcome)) {
    return {
      canPurchase: false,
      mode: null,
      reason: "本次判断属于系统或供应商失败。请先重试判断，不生成报告。",
      blockers: [`technicalOutcome=${technicalOutcome}`],
      evidenceStats
    };
  }

  return {
    canPurchase: false,
    mode: null,
    reason: "当前报告没有达到证据型 Deep Dive 条件，也不适合补足型报告。",
    blockers: [`technicalOutcome=${technicalOutcome}`],
    evidenceStats
  };
}

export function parseDeepDiveMode(value: unknown): DeepDiveMode | null {
  return value === "EVIDENCE_EXECUTION" || value === "IDEA_SIGNAL_REPAIR" ? value : null;
}

export function deepDiveModeLabel(mode: DeepDiveMode | null | undefined) {
  if (mode === "EVIDENCE_EXECUTION") return "证据型执行报告";
  if (mode === "IDEA_SIGNAL_REPAIR") return "想法补足型 Deep Dive";
  return "暂不可生成";
}

function buildEvidenceStats(judgment: IdeaJudgment) {
  const sources = (Array.isArray(judgment.scannedSources) ? judgment.scannedSources : []).map(enrichSourceRecord);
  const confirmedContentCount = sources.filter(
    (source) =>
      (source.evidenceAvailability === "CONFIRMED_CONTENT" && source.isAccessible) ||
      source.origin === "USER_PASTED"
  ).length;
  const qualifyingSources = sources.filter(isQualifyingEvidenceSource);
  const strongOrMediumCount = qualifyingSources.length;
  const independentEvidenceCount = new Set(
    qualifyingSources.map((source) => source.discussionClusterKey ?? source.contentHash ?? source.id)
  ).size;

  return {
    confirmedContentCount,
    independentEvidenceCount,
    strongOrMediumCount
  };
}
