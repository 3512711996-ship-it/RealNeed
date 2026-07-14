import { describe, expect, it } from "vitest";
import { buildDeepDiveEligibility } from "../lib/deep-dive-eligibility";
import { buildReportGenerationEligibility } from "../lib/report-generation-eligibility";
import type { IdeaJudgment, ScannedSource, TechnicalOutcome } from "../lib/types";

describe("free Deep Dive eligibility", () => {
  it("maps insufficient evidence to a repair report without claiming a validated opportunity", () => {
    const conceptual = buildDeepDiveEligibility(baseJudgment("INSUFFICIENT_EVIDENCE"));
    const eligibility = buildReportGenerationEligibility(baseJudgment("INSUFFICIENT_EVIDENCE"), "ACTIVE");
    expect(conceptual.mode).toBe("IDEA_SIGNAL_REPAIR");
    expect(eligibility).toMatchObject({ eligible: true, reportMode: "IDEA_SIGNAL_REPAIR", generationCredentialRequired: true, searchCredentialRequired: false });
  });

  it("requires an active user generation connection for a report", () => {
    const eligibility = buildReportGenerationEligibility(baseJudgment("INSUFFICIENT_EVIDENCE"), "MISSING");
    expect(eligibility).toMatchObject({ eligible: false, blockingReason: "GENERATION_API_NOT_CONNECTED", generationCredentialReady: false });
  });

  it("allows execution reports only when two independent confirmed sources and an opportunity exist", () => {
    const sourceA = validSource("s1", "reddit");
    const sourceB = validSource("s2", "zhihu");
    const judgment = baseJudgment("READY", { marketVerdict: "BUILD_SMALL_MVP", scannedSources: [sourceA, sourceB], accessibleSources: [sourceA, sourceB], strongSignals: [sourceA, sourceB], opportunities: [opportunity()] });
    expect(buildReportGenerationEligibility(judgment, "ACTIVE")).toMatchObject({ eligible: true, reportMode: "EVIDENCE_EXECUTION" });
  });

  it("never turns a search failure into a paid or free report offer", () => {
    const eligibility = buildReportGenerationEligibility(baseJudgment("SEARCH_FAILED"), "ACTIVE");
    expect(eligibility).toMatchObject({ eligible: false, reportMode: null, blockingReason: "SYSTEM_UNAVAILABLE" });
  });
});

function baseJudgment(technicalOutcome: TechnicalOutcome, overrides: Partial<IdeaJudgment> = {}): IdeaJudgment {
  return { originalIdea: "AI 记账工具", interpretedIdea: "记账工具", technicalOutcome, marketVerdict: "NOT_AVAILABLE", confidence: "VERY_LOW", verdict: "KILL_OR_REFRAME", verdictText: "不建议直接做", verdictReason: "证据不足", scores: { demandSignal: 0, paymentSignal: 0, beginnerFeasibility: 70, mvpSimplicity: 70, distributionAccess: 40, overall: 30 }, searchQueries: [], scannedSources: [], accessibleSources: [], inaccessibleSources: [], strongSignals: [], mediumSignals: [], weakSignals: [], irrelevantSources: [], opportunities: [], todayAction: { mode: "HYPOTHESIS_VALIDATION", title: "先验证", description: "当前没有验证需求", targetUserSearch: { keywords: [], platforms: [], whyTheseKeywords: "测试" }, tasks: [], successMetric: { metric: "2 个回复", reasoning: "测试" }, stopCondition: { condition: "无人愿意配合", reasoning: "测试" }, outreachScript: { publicComment: "测试", directMessage: "测试" }, evidenceSummary: { confirmedContentCount: 0, independentEvidenceCount: 0, sourceTitles: [], reasoning: [], confidence: "VERY_LOW" }, evidenceSourceIds: [] }, warnings: [], ...overrides };
}

function validSource(id: string, platform: string): ScannedSource {
  const excerpt = "I am a freelancer and I hate tracking expenses manually every week. I use spreadsheets and need an alternative.";
  return { id, title: "I hate tracking expenses manually", url: `https://example.com/${platform}/${id}`, platform, query: "expense tracker", isAccessible: true, verificationStatus: "ACCESSIBLE", verificationOrigin: "LIVE", origin: "SEARCH_PROVIDER", provider: "TAVILY", providerRequestId: `req-${id}`, evidenceAvailability: "CONFIRMED_CONTENT", sourceType: "USER_DISCUSSION", modelSuggestedStrength: "strong", signalStrength: "strong", extractedText: excerpt, rawContent: excerpt, qualifyingExcerpt: excerpt, targetUser: "freelancer", relevanceScore: 90 };
}

function opportunity() {
  return { id: "op1", productName: "Evidence MVP", oneSentence: "测试", targetUser: "用户", compressedFromOriginalIdea: "测试", painPoint: "测试痛点", mvpOnly: "表单", doNotBuildYet: [], firstThreeDaysBuildPlan: [], firstValidationAction: "找 3 人验证", monetization: "收费测试", chinaFit: "适合", biggestRisk: "证据不足", sourceIds: ["s1"], score: 80 };
}
