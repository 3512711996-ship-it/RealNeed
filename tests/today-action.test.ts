import { describe, expect, it } from "vitest";
import {
  buildHypothesisValidationAction,
  buildTodayActionEvidenceSummary,
  canGenerateEvidenceBasedTodayAction,
  validateTodayActionSourceIds
} from "../lib/generators/today-action-generator";
import type { InterpretedIdea, ScannedSource } from "../lib/types";

describe("today action truthfulness", () => {
  it("does not allow EVIDENCE_BASED when evidenceSourceIds would be empty", () => {
    const result = canGenerateEvidenceBasedTodayAction([]);
    expect(result.allowed).toBe(false);
    expect(result.confirmedContentCount).toBe(0);
  });

  it("falls below evidence mode when confirmed content is less than three", () => {
    const result = canGenerateEvidenceBasedTodayAction([validSource("s1", "reddit", "Expense tracker is too complicated")]);
    expect(result.allowed).toBe(false);
    expect(result.confirmedContentCount).toBe(1);
  });

  it("keeps untrusted legacy sources out of Today Action evidence", () => {
    const result = canGenerateEvidenceBasedTodayAction([
      validSource("s1", "reddit", "Expense tracker is too complicated"),
      { ...validSource("s2", "reddit", "I hate tracking expenses"), origin: "UNTRUSTED_LEGACY_SOURCE" }
    ]);
    expect(result.allowed).toBe(false);
    expect(buildTodayActionEvidenceSummary([validSource("s1"), { ...validSource("s2"), origin: "UNTRUSTED_LEGACY_SOURCE" }]).confirmedContentCount).toBe(1);
  });

  it("does not count SEARCH_LEAD as formal action evidence", () => {
    const lead = {
      ...validSource("s1"),
      evidenceAvailability: "SEARCH_LEAD" as const,
      isAccessible: false,
      signalStrength: "strong" as const
    };
    const result = canGenerateEvidenceBasedTodayAction([lead, validSource("s2"), validSource("s3")]);
    expect(result.allowed).toBe(false);
    expect(buildTodayActionEvidenceSummary([lead, validSource("s2"), validSource("s3")]).confirmedContentCount).toBe(2);
  });

  it("rejects Kimi evidenceSourceIds that do not exist in legal sources", () => {
    expect(() => validateTodayActionSourceIds(["s404"], [validSource("s1"), validSource("s2"), validSource("s3")])).toThrow(/s404/);
  });

  it("can pass evidence mode with three confirmed sources, two independent discussions, and user evidence", () => {
    const sources = [validSource("s1", "reddit"), validSource("s2", "zhihu"), validSource("s3", "quora")];
    const result = canGenerateEvidenceBasedTodayAction(sources);
    expect(result.allowed).toBe(true);
    expect(result.independentEvidenceCount).toBeGreaterThanOrEqual(2);
  });

  it("three hypothesis actions are not simple noun replacements", () => {
    const ideas = [
      {
        idea: "成人用品真实测评工具",
        interpretedIdea: interpreted("成人用品测评", ["注重隐私的消费者"], ["不知道测评是否真实"], ["成人用品", "真实测评"])
      },
      {
        idea: "大学生食堂排队提醒",
        interpretedIdea: interpreted("校园食堂排队", ["大学生"], ["排队时间不可预期"], ["食堂排队", "校园"])
      },
      {
        idea: "自由职业者账单整理",
        interpretedIdea: interpreted("账单整理", ["自由职业者"], ["手动整理发票和账单耗时"], ["账单", "发票", "自由职业"])
      }
    ];

    const actions = ideas.map((item) =>
      buildHypothesisValidationAction({
        idea: item.idea,
        interpretedIdea: item.interpretedIdea,
        sources: [],
        searchQueries: []
      })
    );

    expect(new Set(actions.map((action) => action.targetUserSearch.platforms.join("|"))).size).toBe(3);
    expect(new Set(actions.map((action) => action.targetUserSearch.keywords.join("|"))).size).toBe(3);
    expect(new Set(actions.map((action) => action.outreachScript.publicComment)).size).toBe(3);
    expect(new Set(actions.map((action) => action.stopCondition.condition)).size).toBe(3);
  });

  it("hypothesis action carries the disclaimer and low confidence when evidence is absent", () => {
    const action = buildHypothesisValidationAction({
      idea: "大学生食堂排队提醒",
      interpretedIdea: interpreted("校园食堂排队", ["大学生"], ["排队时间不可预期"], ["食堂排队"]),
      sources: [],
      searchQueries: []
    });
    expect(action.mode).toBe("HYPOTHESIS_VALIDATION");
    expect(action.description).toContain("不代表 RealNeed 已经确认需求");
    expect(action.evidenceSummary.confidence).toBe("VERY_LOW");
  });
});

function validSource(id: string, platform = "reddit", title = "I hate tracking expenses manually"): ScannedSource {
  const excerpt =
    "I am a freelancer. Every week I hate tracking expenses manually because it takes too much time. I keep using spreadsheets and still forget client invoices. Other people in the thread say they have the same problem.";
  return {
    id,
    title,
    url: `https://www.${platform}.com/thread/${id}`,
    platform,
    query: "expense tracker too complicated",
    isAccessible: true,
    verificationStatus: "ACCESSIBLE",
    verificationOrigin: "LIVE",
    origin: "SEARCH_PROVIDER",
    provider: "TAVILY",
    providerRequestId: `req-${id}`,
    searchRequestId: `search-${id}`,
    evidenceAvailability: "CONFIRMED_CONTENT",
    sourceType: platform === "zhihu" ? "QUESTION_ANSWER" : "USER_DISCUSSION",
    extractedText: excerpt,
    rawContent: excerpt,
    qualifyingExcerpt: excerpt,
    modelSuggestedStrength: "strong",
    signalStrength: "strong",
    painPoint: "tracking expenses manually takes too much time",
    targetUser: "freelancers",
    userQuoteOrSummary: "User complains about manual spreadsheet expense tracking.",
    relevanceScore: 92
  };
}

function interpreted(domain: string, targetUsers: string[], painPoints: string[], keywordsZh: string[]): InterpretedIdea {
  return {
    domain,
    targetUsers,
    possiblePainPoints: painPoints,
    keywordsZh,
    keywordsEn: [],
    assumptions: []
  };
}
