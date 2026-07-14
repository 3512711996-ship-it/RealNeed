import { describe, expect, it } from "vitest";
import { bindQualifiedEvidenceToSources } from "../lib/judgment-engine";
import { buildTrustSnapshot, enrichSourceRecord } from "../lib/trust-analysis";
import { filterEvidenceExecutionSourceIds } from "../lib/deep-dive-generator";
import { selectDeepDiveOpportunity } from "../lib/deep-dive-selector";
import type { EvidenceSource, IdeaJudgment, ScannedSource } from "../lib/types";

describe("evidence hard rules", () => {
  it("keeps official and commercial pages out of strong evidence", () => {
    const source = classify(
      sourceFixture({
        url: "https://vendor.example/pricing",
        finalUrl: "https://vendor.example/pricing",
        platform: "web",
        title: "Official product pricing and subscription",
        extractedText: "Official product pricing. Start free and subscribe for 20 USD per month.",
        qualifyingExcerpt: "Official product pricing. Start free and subscribe for 20 USD per month."
      })
    );

    expect(source.sourceType).toBe("PAID_SERVICE");
    expect(source.finalEvidenceStrength).toBe("weak");
    expect(source.evidenceEligibility).not.toBe("ELIGIBLE_USER_EVIDENCE");
    expect(source.hardRuleReasonCodes).toContain("COMMERCIAL_CONTENT");
  });

  it("keeps editorial reviews and tool comparisons as background only", () => {
    const review = classify(
      sourceFixture({
        url: "https://publisher.example/review",
        finalUrl: "https://publisher.example/review",
        platform: "web",
        title: "Card grading app review",
        extractedText: "A media review comparing the product features and pricing.",
        qualifyingExcerpt: "A media review comparing the product features and pricing."
      })
    );
    const comparison = classify(
      sourceFixture({
        url: "https://publisher.example/comparison",
        finalUrl: "https://publisher.example/comparison",
        platform: "web",
        title: "Top 10 card grading tools comparison",
        extractedText: "We compare the best card grading tools, features and prices.",
        qualifyingExcerpt: "We compare the best card grading tools, features and prices."
      })
    );

    expect(review.sourceType).toBe("MEDIA_REVIEW");
    expect(review.finalEvidenceStrength).toBe("weak");
    expect(comparison.sourceType).toBe("TOOL_COMPARISON");
    expect(comparison.evidenceEligibility).toBe("COMPETITOR_ONLY");
  });

  it("allows a traceable user discussion with concrete repeated behavior", () => {
    const excerpt =
      "I am a card collector. Every week I manually track grades in a spreadsheet, waste two hours, and I am looking for an easier tool.";
    const source = classify(
      sourceFixture({
        url: "https://www.reddit.com/r/cards/comments/abc123/grading_workflow",
        finalUrl: "https://www.reddit.com/r/cards/comments/abc123/grading_workflow",
        platform: "reddit",
        title: "I am tired of my grading workflow",
        extractedText: excerpt,
        qualifyingExcerpt: excerpt,
        targetUser: "card collector"
      })
    );

    expect(source.sourceType).toBe("COMMUNITY_POST");
    expect(source.finalEvidenceStrength).toBe("strong");
    expect(source.evidenceEligibility).toBe("ELIGIBLE_USER_EVIDENCE");
    expect(source.qualifyingSignals).toEqual(expect.arrayContaining(["CONCRETE_USER", "CONCRETE_SCENARIO", "WORKAROUND"]));
  });

  it("does not upgrade keyword-only pain text without a concrete user and scenario", () => {
    const source = classify(
      sourceFixture({
        url: "https://www.reddit.com/r/cards/comments/keyword/pain_point",
        finalUrl: "https://www.reddit.com/r/cards/comments/keyword/pain_point",
        platform: "reddit",
        title: "Card grading pain point problem",
        extractedText: "Card grading problem and pain point.",
        qualifyingExcerpt: "Card grading problem and pain point.",
        painPoint: "Card grading problem",
        targetUser: undefined
      })
    );

    expect(source.finalEvidenceStrength).toBe("weak");
    expect(source.evidenceEligibility).not.toBe("ELIGIBLE_USER_EVIDENCE");
    expect(source.hardRuleReasonCodes).toEqual(expect.arrayContaining(["NO_CONCRETE_USER", "NO_CONCRETE_SCENARIO"]));
  });

  it("caps user-pasted evidence at medium and does not claim external verification", () => {
    const excerpt = "I run a shop. Every day I manually copy orders into Excel. I hate it because it takes too much time.";
    const source = classify(
      sourceFixture({
        id: "manual-1",
        url: "",
        finalUrl: undefined,
        platform: "user_paste",
        origin: "USER_PASTED",
        provider: "USER",
        verificationOrigin: "MANUAL",
        extractedText: excerpt,
        qualifyingExcerpt: excerpt,
        targetUser: "shop owner"
      })
    );

    expect(source.finalEvidenceStrength).toBe("medium");
    expect(source.evidenceEligibility).toBe("ELIGIBLE_USER_EVIDENCE");
  });

  it("counts duplicate mirrors as one independent qualifying discussion", () => {
    const excerpt = "I am a collector. Every week I manually use Excel. I hate it because it takes too much time, and I need an alternative tool.";
    const first = classify(sourceFixture({ id: "s1", extractedText: excerpt, qualifyingExcerpt: excerpt }));
    const second = { ...classify(sourceFixture({ id: "s2", extractedText: excerpt, qualifyingExcerpt: excerpt })), discussionClusterKey: first.discussionClusterKey };
    const snapshot = buildTrustSnapshot(judgmentFixture([first, second]));

    expect(snapshot.qualifyingUserEvidenceCount).toBe(2);
    expect(snapshot.independentEvidenceCount).toBe(1);
  });

  it("binds opportunity evidence to sourceDisplayId only after hard-rule qualification", () => {
    const excerpt = "I am a collector. Every week I manually use Excel. I hate it because it takes too much time, and I need an alternative tool.";
    const eligible = { ...classify(sourceFixture({ id: "internal-1", extractedText: excerpt, qualifyingExcerpt: excerpt })), sourceDisplayId: "s1" };
    const rejected = classify(
      sourceFixture({
        id: "internal-2",
        title: "Official product pricing",
        extractedText: "Official pricing and subscription page.",
        qualifyingExcerpt: "Official pricing and subscription page."
      })
    );
    const bound = bindQualifiedEvidenceToSources([evidenceFixture("internal-1-e1"), evidenceFixture("internal-2-e1")], [eligible, rejected]);

    expect(bound).toHaveLength(1);
    expect(bound[0]?.id).toBe("s1");
    expect(bound[0]?.sourceText).toBe(excerpt);
  });

  it("prevents evidence execution reports from citing commercial or unverified source ids", () => {
    const excerpt = "I am a collector. Every week I manually use Excel. I hate it because it takes too much time, and I need an alternative tool.";
    const eligible = { ...classify(sourceFixture({ id: "eligible", extractedText: excerpt, qualifyingExcerpt: excerpt })), sourceDisplayId: "s1" };
    const commercial = {
      ...classify(
        sourceFixture({
          id: "commercial",
          url: "https://vendor.example/pricing",
          finalUrl: "https://vendor.example/pricing",
          platform: "web",
          title: "Official product pricing",
          extractedText: "Official pricing and subscription page.",
          qualifyingExcerpt: "Official pricing and subscription page."
        })
      ),
      sourceDisplayId: "s2"
    };
    const unverified = {
      ...eligible,
      id: "unverified",
      sourceDisplayId: "s3",
      isAccessible: false,
      verificationStatus: "UNVERIFIED" as const
    };
    const judgment = judgmentFixture([eligible, commercial, unverified]);
    judgment.opportunities = [
      {
        id: "op-commercial",
        productName: "Commercial-only idea",
        oneSentence: "test",
        targetUser: "test",
        compressedFromOriginalIdea: "test",
        painPoint: "test",
        mvpOnly: "test",
        doNotBuildYet: [],
        firstThreeDaysBuildPlan: [],
        firstValidationAction: "test",
        monetization: "test",
        chinaFit: "test",
        biggestRisk: "test",
        sourceIds: ["s2"],
        score: 80
      }
    ];

    expect(filterEvidenceExecutionSourceIds(["s1", "s2", "s3", "invented"], judgment)).toEqual(["s1"]);
    expect(selectDeepDiveOpportunity(judgment).selectedOpportunity).toBeUndefined();
  });
});

function classify(source: ScannedSource) {
  return enrichSourceRecord(source);
}

function sourceFixture(overrides: Partial<ScannedSource> = {}): ScannedSource {
  const excerpt = "I am a collector. Every week I manually use Excel. I hate it because it takes too much time, and I need an alternative tool.";
  return {
    id: "s1",
    sourceDisplayId: "s1",
    title: "Collector asks for a better workflow",
    url: "https://www.reddit.com/r/cards/comments/abc123/workflow",
    finalUrl: "https://www.reddit.com/r/cards/comments/abc123/workflow",
    platform: "reddit",
    query: "card grading workflow",
    isAccessible: true,
    statusCode: 200,
    verificationStatus: "ACCESSIBLE",
    verificationOrigin: "LIVE",
    origin: "SEARCH_PROVIDER",
    provider: "TAVILY",
    providerRequestId: "req-1",
    evidenceAvailability: "CONFIRMED_CONTENT",
    contentExtractionStatus: "CONTENT_EXTRACTED",
    modelSuggestedStrength: "strong",
    signalStrength: "strong",
    extractedText: excerpt,
    qualifyingExcerpt: excerpt,
    painPoint: "Manual grading workflow wastes time",
    targetUser: "card collector",
    relevanceScore: 92,
    ...overrides
  };
}

function evidenceFixture(id: string): EvidenceSource {
  return {
    id,
    title: "Evidence",
    url: "https://www.reddit.com/r/cards/comments/abc123/workflow",
    platform: "reddit",
    sourceText: "model text",
    painPoint: "Manual work",
    targetUser: "collector",
    evidenceStrength: "strong",
    relevanceScore: 90
  };
}

function judgmentFixture(sources: ScannedSource[]): IdeaJudgment {
  return {
    originalIdea: "card grading tool",
    interpretedIdea: "tool for card collectors",
    verdict: "BUILD_SMALL_MVP",
    verdictText: "test",
    verdictReason: "test",
    scores: { demandSignal: 70, paymentSignal: 60, beginnerFeasibility: 80, mvpSimplicity: 75, distributionAccess: 50, overall: 67 },
    searchQueries: [],
    scannedSources: sources,
    accessibleSources: sources,
    inaccessibleSources: [],
    strongSignals: sources,
    mediumSignals: [],
    weakSignals: [],
    irrelevantSources: [],
    opportunities: [],
    warnings: []
  } as unknown as IdeaJudgment;
}
