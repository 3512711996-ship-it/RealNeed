import { describe, expect, it } from "vitest";
import { enrichJudgmentTrust } from "../lib/trust-analysis";
import { normalizeSourceUrl } from "../lib/source-verifier";
import type { IdeaJudgment } from "../lib/types";

function baseJudgment(overrides: Partial<IdeaJudgment> = {}): IdeaJudgment {
  const judgment: IdeaJudgment = {
    originalIdea: "AI 记账工具",
    interpretedIdea: "记账；目标用户：自由职业者；可能痛点：手动追踪支出太麻烦",
    verdict: "BUILD_SMALL_MVP",
    verdictText: "值得做一个小 MVP",
    verdictReason: "测试",
    scores: {
      demandSignal: 80,
      paymentSignal: 55,
      beginnerFeasibility: 80,
      mvpSimplicity: 80,
      distributionAccess: 60,
      overall: 73
    },
    searchQueries: ["site:reddit.com expense tracker too complicated"],
    scannedSources: [],
    accessibleSources: [],
    inaccessibleSources: [],
    strongSignals: [],
    mediumSignals: [],
    weakSignals: [],
    irrelevantSources: [],
    opportunities: [],
    todayAction: {
      mode: "HYPOTHESIS_VALIDATION",
      title: "先验证",
      description: "先找用户聊",
      targetUserSearch: {
        keywords: [],
        platforms: [],
        whyTheseKeywords: "测试"
      },
      tasks: [],
      successMetric: {
        metric: "3 个回复",
        reasoning: "测试"
      },
      stopCondition: {
        condition: "无人回复",
        reasoning: "测试"
      },
      outreachScript: {
        publicComment: "你好",
        directMessage: "你好"
      },
      evidenceSummary: {
        confirmedContentCount: 0,
        independentEvidenceCount: 0,
        sourceTitles: [],
        reasoning: [],
        confidence: "VERY_LOW"
      },
      evidenceSourceIds: []
    },
    warnings: [],
    ...overrides
  };

  return judgment;
}

describe("trust analysis", () => {
  it("blocks opportunities when independent evidence is below two", () => {
    const source = {
      id: "s1",
      title: "I hate tracking expenses",
      url: "https://www.reddit.com/r/freelance/comments/abc/i_hate_tracking_expenses/",
      platform: "reddit",
      query: "expense tracker",
      isAccessible: true,
      verificationStatus: "ACCESSIBLE" as const,
      origin: "SEARCH_PROVIDER" as const,
      provider: "TAVILY" as const,
      providerRequestId: "req-test",
      evidenceAvailability: "CONFIRMED_CONTENT" as const,
      extractedText: "I hate tracking expenses manually in Excel. It takes too much time.",
      signalStrength: "strong" as const
    };
    const result = enrichJudgmentTrust(
      baseJudgment({
        scannedSources: [source],
        accessibleSources: [source],
        strongSignals: [source],
        opportunities: [
          {
            id: "op1",
            productName: "Expense Paste",
            oneSentence: "手动粘贴账单整理",
            targetUser: "自由职业者",
            compressedFromOriginalIdea: "AI 记账",
            painPoint: "追踪支出麻烦",
            mvpOnly: "表单",
            doNotBuildYet: [],
            firstThreeDaysBuildPlan: [],
            firstValidationAction: "找 3 个用户",
            monetization: "人民币单次收费",
            chinaFit: "微信收款",
            biggestRisk: "不愿上传账单",
            sourceIds: ["s1"],
            score: 80
          }
        ]
      })
    );

    expect(result.technicalOutcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.marketVerdict).toBe("NOT_AVAILABLE");
    expect(result.opportunities).toHaveLength(0);
    expect(result.canShowOverallScore).toBe(false);
  });

  it("counts two reddit links from the same thread as one independent discussion", () => {
    const sourceA = {
      id: "s1",
      title: "Expense tracker too complicated",
      url: "https://www.reddit.com/r/personalfinance/comments/abc/expense_tracker_too_complicated/",
      platform: "reddit",
      query: "expense tracker",
      isAccessible: true,
      verificationStatus: "ACCESSIBLE" as const,
      origin: "SEARCH_PROVIDER" as const,
      provider: "TAVILY" as const,
      providerRequestId: "req-test",
      evidenceAvailability: "CONFIRMED_CONTENT" as const,
      extractedText: "I am a freelancer. Every week expense trackers are too complicated and I keep returning to spreadsheets.",
      qualifyingExcerpt: "I am a freelancer. Every week expense trackers are too complicated and I keep returning to spreadsheets.",
      modelSuggestedStrength: "strong" as const,
      signalStrength: "strong" as const,
      targetUser: "freelancer",
      relevanceScore: 90
    };
    const sourceB = {
      ...sourceA,
      id: "s2",
      url: "https://old.reddit.com/r/personalfinance/comments/abc/expense_tracker_too_complicated/comment/123/"
    };
    const result = enrichJudgmentTrust(
      baseJudgment({
        scannedSources: [sourceA, sourceB],
        accessibleSources: [sourceA, sourceB],
        strongSignals: [sourceA, sourceB]
      })
    );

    expect(result.independentEvidenceCount).toBe(1);
    expect(result.technicalOutcome).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("keeps unsafe URL schemes out of normalized source URLs", () => {
    expect(normalizeSourceUrl("file:///etc/passwd")).toBe("");
    expect(normalizeSourceUrl("http://example.com/a?utm_source=x&b=1")).toBe("http://example.com/a?b=1");
  });
});
