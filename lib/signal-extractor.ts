import { extractEvidence } from "@/lib/evidence-extractor";
import { validateEvidenceSource } from "@/lib/evidence-validator";
import { scoreEvidence } from "@/lib/evidence-scorer";
import type { ApiUsageContext } from "@/lib/usage-tracker";
import type { EvidenceSource, InterpretedIdea, ScannedSource, SearchResult } from "@/lib/types";
import type { VerifiedSource } from "@/lib/source-verifier";

export async function extractDemandSignals({
  idea,
  interpretedIdea,
  accessibleSources,
  usage
}: {
  idea: string;
  interpretedIdea: InterpretedIdea;
  accessibleSources: ScannedSource[];
  usage?: Omit<ApiUsageContext, "operation">;
}): Promise<{ scannedSources: ScannedSource[]; usableEvidence: EvidenceSource[]; warnings: string[]; usedKimi: boolean }> {
  if (accessibleSources.length === 0) {
    return { scannedSources: [], usableEvidence: [], warnings: [], usedKimi: false };
  }

  const searchResults = accessibleSources.map(sourceToSearchResult);

  try {
    const extracted = await extractEvidence({ idea, interpretedIdea, searchResults, usage });
    const sourceByUrl = buildSourceLookup(accessibleSources);
    const evidenceBySourceId = new Map<string, EvidenceSource[]>();

    for (const evidence of extracted.evidence) {
      const source = evidence.url ? sourceByUrl.get(normalizeUrlForCompare(evidence.url)) : findManualSource(accessibleSources);
      if (!source) continue;

      const isManual = source.platform.includes("用户粘贴") || source.platform === "user_paste" || !source.url;
      const valid = isManual
        ? { isValid: true, confidence: Math.min(72, evidence.relevanceScore), reason: "User pasted content" }
        : validateEvidenceSource({
            source: scannedSourceToVerifiedSource(source),
            idea,
            painPoint: evidence.painPoint,
            sourceText: evidence.sourceText,
            userQuoteOrSummary: evidence.userQuoteOrSummary
          });

      if (!valid.isValid) continue;

      const attached: EvidenceSource = {
        ...evidence,
        id: `${source.id}-e${(evidenceBySourceId.get(source.id)?.length ?? 0) + 1}`,
        title: source.title,
        url: isManual ? undefined : source.finalUrl ?? source.url,
        platform: isManual ? "用户粘贴内容" : source.platform,
        evidenceStrength: normalizeStrength(evidence.evidenceStrength, valid.confidence, isManual),
        relevanceScore: Math.max(evidence.relevanceScore, valid.confidence),
        sourceVerification: {
          isExternalVerified: !isManual,
          statusCode: source.statusCode ?? undefined
        }
      };
      const list = evidenceBySourceId.get(source.id) ?? [];
      list.push(attached);
      evidenceBySourceId.set(source.id, list);
    }

    const scannedSources = accessibleSources.map((source) => {
      const best = pickBestEvidence(evidenceBySourceId.get(source.id) ?? []);
      if (!best) return classifyWeakOrIrrelevant(source, idea, interpretedIdea);

      return {
        ...source,
        modelSuggestedStrength: best.evidenceStrength,
        signalStrength: best.evidenceStrength,
        qualifyingExcerpt: best.sourceText,
        painPoint: best.painPoint,
        targetUser: best.targetUser,
        userQuoteOrSummary: best.userQuoteOrSummary,
        whyThisSignal: best.whyThisIsDemand ?? "来源中出现了可追溯的需求信号。",
        relevanceScore: best.relevanceScore
      };
    });

    const usableEvidence = scoreEvidence(
      Array.from(evidenceBySourceId.values())
        .map((items) => pickBestEvidence(items))
        .filter((item): item is EvidenceSource => Boolean(item)),
      interpretedIdea
    ).filter((source) => source.relevanceScore >= 50 && (source.evidenceStrength === "strong" || source.evidenceStrength === "medium"));

    return { scannedSources, usableEvidence, warnings: extracted.warnings, usedKimi: extracted.usedKimi };
  } catch (error) {
    const message = error instanceof Error ? error.message : "需求信号提取失败";
    return {
      scannedSources: accessibleSources.map((source) => ({
        ...source,
        signalStrength: "weak",
        whyRejected: `需求信号提取失败，不能当作强/中信号：${message}`,
        relevanceScore: 20
      })),
      usableEvidence: [],
      warnings: ["需求信号提取失败；系统保留可访问来源，但不生成产品机会。"],
      usedKimi: false
    };
  }
}

function sourceToSearchResult(source: ScannedSource): SearchResult {
  return {
    title: source.title,
    url: source.url || undefined,
    platform: source.platform,
    snippet: (source.extractedText ?? source.rawContent ?? "").slice(0, 500),
    rawContent: source.rawContent ?? source.extractedText ?? ""
  };
}

export function scannedSourceToVerifiedSource(source: ScannedSource): VerifiedSource {
  return {
    title: source.title,
    url: source.url,
    finalUrl: source.finalUrl,
    platform: source.platform,
    statusCode: source.statusCode ?? null,
    httpStatus: source.httpStatus ?? source.statusCode ?? null,
    isAccessible: source.isAccessible,
    extractedText: source.extractedText ?? "",
    failureReason: source.failureReason,
    verificationStatus: source.verificationStatus,
    verificationOrigin: source.verificationOrigin,
    checkedAt: source.checkedAt ?? null,
    durationMs: source.durationMs ?? null,
    redirectCount: source.redirectCount ?? 0,
    errorCode: source.verificationErrorCode ?? null,
    errorMessage: source.failureReason ?? null
  };
}

function classifyWeakOrIrrelevant(source: ScannedSource, idea: string, interpretedIdea: InterpretedIdea): ScannedSource {
  const text = `${source.title} ${source.extractedText ?? ""}`.toLowerCase();
  const related = hasRelatedSignal(text, idea, interpretedIdea);
  const demand = hasDemandSignal(text);

  if (related && demand) {
    return {
      ...source,
      signalStrength: "weak",
      whyThisSignal: "这个来源和想法相关，也出现了痛点词，但没有足够明确的用户抱怨、求助或付费线索。",
      relevanceScore: 42
    };
  }

  if (related) {
    return {
      ...source,
      signalStrength: "weak",
      whyRejected: "这个来源和想法相关，但没有明确用户痛苦或付费线索。",
      relevanceScore: 30
    };
  }

  return {
    ...source,
    signalStrength: "irrelevant",
    whyRejected: "这个来源可访问，但没有发现和想法直接相关的需求信号。",
    relevanceScore: 8
  };
}

function normalizeStrength(strength: EvidenceSource["evidenceStrength"], confidence: number, isManual: boolean): EvidenceSource["evidenceStrength"] {
  if (isManual && strength === "strong") return "medium";
  if (strength === "strong" && confidence >= 78) return "strong";
  if ((strength === "strong" || strength === "medium") && confidence >= 55) return "medium";
  return "weak";
}

function buildSourceLookup(sources: ScannedSource[]) {
  const lookup = new Map<string, ScannedSource>();
  for (const source of sources) {
    if (source.url) lookup.set(normalizeUrlForCompare(source.url), source);
    if (source.finalUrl) lookup.set(normalizeUrlForCompare(source.finalUrl), source);
  }
  return lookup;
}

function findManualSource(sources: ScannedSource[]) {
  return sources.find((source) => source.platform.includes("用户粘贴") || source.platform === "user_paste" || !source.url);
}

function pickBestEvidence(evidence: EvidenceSource[]) {
  return [...evidence].sort((a, b) => b.relevanceScore - a.relevanceScore)[0];
}

function hasRelatedSignal(text: string, idea: string, interpretedIdea: InterpretedIdea) {
  const tokens = [
    ...extractTokens(idea),
    ...extractTokens(interpretedIdea.domain),
    ...interpretedIdea.keywordsZh.flatMap(extractTokens),
    ...interpretedIdea.keywordsEn.flatMap(extractTokens),
    ...expandCrossLingualKeywords(`${idea} ${interpretedIdea.domain}`)
  ].filter((token) => token.length >= 2);

  return tokens.some((token) => text.includes(token.toLowerCase()));
}

function hasDemandSignal(text: string) {
  const signals = [
    "how do you handle",
    "is there a tool for",
    "too complicated",
    "i hate",
    "any alternative to",
    "struggling with",
    "manual",
    "spreadsheet",
    "excel",
    "notion",
    "麻烦",
    "不好用",
    "太复杂",
    "求推荐",
    "手动",
    "表格",
    "重复",
    "耗时",
    "痛点",
    "抱怨",
    "吐槽"
  ];
  return signals.some((signal) => text.includes(signal.toLowerCase()));
}

function expandCrossLingualKeywords(value: string) {
  const lower = value.toLowerCase();
  const expansions: string[] = [];
  if (/记账|账单|预算|expense|budget/.test(lower)) expansions.push("budgeting", "expense", "expense tracker", "tracking expenses");
  if (/学习|课程|作业|study|assignment/.test(lower)) expansions.push("study", "student", "assignment", "study planner");
  if (/文案|小红书|内容|caption|content/.test(lower)) expansions.push("caption", "content", "creator", "social media");
  if (/简历|求职|resume|job/.test(lower)) expansions.push("resume", "job application", "cover letter");
  if (/健身|训练|workout|fitness/.test(lower)) expansions.push("workout", "fitness", "training");
  return expansions;
}

function extractTokens(value: string) {
  return Array.from(new Set(value.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]{2,}/g) ?? []));
}

function normalizeUrlForCompare(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return value.trim();
  }
}
