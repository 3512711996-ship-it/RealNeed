import { z } from "zod";
import { callKimiJson } from "@/lib/kimi";
import { selectDeepDiveOpportunity } from "@/lib/deep-dive-selector";
import {
  evidenceExecutionSystemPrompt,
  evidenceExecutionUserPrompt,
  ideaSignalRepairSystemPrompt,
  ideaSignalRepairUserPrompt
} from "@/lib/prompts/deep-dive-prompt";
import type { ApiUsageContext } from "@/lib/usage-tracker";
import type { DeepDiveMode, DeepDiveReport, EvidenceExecutionReport, IdeaJudgment, IdeaSignalRepairReport } from "@/lib/types";
import { isQualifyingEvidenceSource } from "@/lib/evidence-policy";
import { enrichSourceRecord } from "@/lib/trust-analysis";

const EvidenceExecutionReportSchema = z.object({
  mode: z.literal("EVIDENCE_EXECUTION").optional(),
  judgmentId: z.string().min(1),
  recommendation: z.object({
    selectedOpportunityId: z.string().optional(),
    productName: z.string().min(1),
    oneSentence: z.string().min(1),
    whyThisOne: z.string().min(1),
    whyNotTheOthers: z.array(
      z.object({
        opportunityName: z.string().min(1),
        reason: z.string().min(1)
      })
    ),
    confidence: z.enum(["low", "medium", "high"])
  }),
  targetUser: z.object({
    description: z.string().min(1),
    specificScene: z.string().min(1),
    currentAlternative: z.string().min(1),
    alternativeProblem: z.string().min(1)
  }),
  mvpPlan: z.object({
    goal: z.string().min(1),
    productForm: z.string().min(1),
    estimatedBuildTime: z.string().min(1),
    pages: z.array(
      z.object({
        pageName: z.string().min(1),
        purpose: z.string().min(1),
        sections: z.array(z.string().min(1))
      })
    ),
    coreInputs: z.array(z.string().min(1)),
    coreOutputs: z.array(z.string().min(1)),
    userFlow: z.array(z.string().min(1)),
    techStack: z.array(z.string().min(1)),
    manualDeliveryOption: z.string().min(1),
    doNotBuildYet: z.array(z.string().min(1))
  }),
  firstUserMap: z.object({
    platforms: z.array(
      z.object({
        platform: z.string().min(1),
        reason: z.string().min(1),
        searchKeywords: z.array(z.string().min(1)),
        targetPostSignals: z.array(z.string().min(1)),
        nonTargetSignals: z.array(z.string().min(1))
      })
    ),
    totalPeopleToContact: z.number().int().min(1)
  }),
  outreachScripts: z.object({
    publicComment: z.string().min(1),
    directMessage: z.string().min(1),
    followUp: z.string().min(1),
    paymentTest: z.string().min(1)
  }),
  todayAction: z.object({
    title: z.string().min(1),
    tasks: z.array(z.string().min(1)),
    expectedOutput: z.string().min(1),
    successMetric: z.string().min(1),
    stopCondition: z.string().min(1)
  }),
  threeDayValidationPlan: z.array(
    z.object({
      day: z.number().int().min(1).max(3),
      objective: z.string().min(1),
      tasks: z.array(z.string().min(1)),
      output: z.string().min(1),
      successMetric: z.string().min(1),
      stopCondition: z.string().min(1)
    })
  ),
  pricingTest: z.object({
    freeTestOffer: z.string().min(1),
    firstPaidOffer: z.string().min(1),
    suggestedPrice: z.string().min(1),
    questionToAsk: z.string().min(1),
    validPaymentSignal: z.string().min(1),
    invalidPaymentSignal: z.string().min(1)
  }),
  risks: z.array(
    z.object({
      risk: z.string().min(1),
      whyItMatters: z.string().min(1),
      mitigation: z.string().min(1)
    })
  ),
  finalStopConditions: z.array(z.string().min(1)),
  codexPrompt: z.string().min(1),
  evidenceSourceIds: z.array(z.string().min(1)),
  generatedAt: z.string().min(1)
});

const IdeaSignalRepairReportSchema = z.object({
  mode: z.literal("IDEA_SIGNAL_REPAIR").optional(),
  judgmentId: z.string().min(1),
  title: z.string().min(1),
  disclaimer: z.string().min(1),
  currentVerdict: z.object({
    technicalOutcome: z.enum([
      "READY",
      "SEARCH_NOT_CONFIGURED",
      "SEARCH_FAILED",
      "NO_SEARCH_RESULTS",
      "EXTRACTION_INCOMPLETE",
      "VERIFICATION_INCOMPLETE",
      "SOURCES_BLOCKED",
      "INSUFFICIENT_EVIDENCE",
      "ANALYSIS_FAILED",
      "DATABASE_FAILED",
      "PROCESSING_FAILED"
    ]),
    marketVerdict: z.enum(["BUILD_SMALL_MVP", "VALIDATE_FIRST", "TALK_TO_USERS", "KILL_OR_REFRAME", "NOT_AVAILABLE"]),
    whyNotValidated: z.string().min(1)
  }),
  evidenceGapMap: z.array(
    z.object({
      gap: z.string().min(1),
      whyItMatters: z.string().min(1),
      howToFill: z.string().min(1)
    })
  ),
  reconstructedHypotheses: z.array(
    z.object({
      targetUser: z.string().min(1),
      painHypothesis: z.string().min(1),
      riskyAssumption: z.string().min(1),
      validationSignal: z.string().min(1)
    })
  ),
  searchPlan: z.array(
    z.object({
      platform: z.string().min(1),
      queries: z.array(z.string().min(1)),
      targetSignals: z.array(z.string().min(1)),
      rejectSignals: z.array(z.string().min(1))
    })
  ),
  interviewPlan: z.object({
    whoToAsk: z.string().min(1),
    questions: z.array(z.string().min(1)),
    validAnswers: z.array(z.string().min(1)),
    invalidAnswers: z.array(z.string().min(1))
  }),
  manualDeliveryTest: z.object({
    offer: z.string().min(1),
    deliverySteps: z.array(z.string().min(1)),
    presaleScript: z.string().min(1),
    validPaymentSignal: z.string().min(1),
    invalidPaymentSignal: z.string().min(1)
  }),
  threeDayRepairPlan: z.array(
    z.object({
      day: z.number().int().min(1).max(3),
      objective: z.string().min(1),
      tasks: z.array(z.string().min(1)),
      output: z.string().min(1),
      continueIf: z.string().min(1),
      stopIf: z.string().min(1)
    })
  ),
  finalDecisionRules: z.object({
    continueRules: z.array(z.string().min(1)),
    stopRules: z.array(z.string().min(1)),
    reframeRules: z.array(z.string().min(1))
  }),
  codexPrompt: z.string().min(1),
  evidenceSourceIds: z.array(z.string()),
  generatedAt: z.string().min(1)
});

export class DeepDiveGenerationError extends Error {
  status = 502;

  constructor(message: string) {
    super(message);
    this.name = "DeepDiveGenerationError";
  }
}

export async function generateDeepDiveReport(
  judgment: IdeaJudgment,
  judgmentId: string,
  mode: DeepDiveMode = "EVIDENCE_EXECUTION",
  usage?: Omit<ApiUsageContext, "operation">
): Promise<DeepDiveReport> {
  if (mode === "IDEA_SIGNAL_REPAIR") return generateIdeaSignalRepairReport(judgment, judgmentId, usage);
  return generateEvidenceExecutionReport(judgment, judgmentId, usage);
}

export async function generateEvidenceExecutionReport(
  judgment: IdeaJudgment,
  judgmentId: string,
  usage?: Omit<ApiUsageContext, "operation">
): Promise<EvidenceExecutionReport> {
  const selection = selectDeepDiveOpportunity(judgment);
  const promptJudgment = compactJudgmentForDeepDivePrompt(judgment, "EVIDENCE_EXECUTION");
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const report = await callKimiJson({
        schema: EvidenceExecutionReportSchema,
        system: evidenceExecutionSystemPrompt,
        user: evidenceExecutionUserPrompt({
          judgment: { ...promptJudgment, judgmentId },
          selectedOpportunity: compactOpportunity(selection.selectedOpportunity),
          rejectedReasons: selection.rejectedReasons.slice(0, 8).map((reason) => truncateText(reason, 280))
        }),
        temperature: attempt === 0 ? 0.2 : 0.05,
        usage: usage ? { ...usage, judgmentId, operation: "deep_dive_evidence_execution" } : { judgmentId, operation: "deep_dive_evidence_execution" }
      });

      const evidenceSourceIds = filterEvidenceExecutionSourceIds(report.evidenceSourceIds, judgment);
      if (evidenceSourceIds.length === 0) {
        throw new DeepDiveGenerationError("证据型 Deep Dive 没有绑定任何真实来源 ID。");
      }

      return {
        ...report,
        mode: "EVIDENCE_EXECUTION",
        judgmentId,
        evidenceSourceIds,
        generatedAt: report.generatedAt || new Date().toISOString()
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Deep Dive generation failed";
    }
  }

  throw new DeepDiveGenerationError(lastError || "Deep Dive generation failed");
}

export async function generateIdeaSignalRepairReport(
  judgment: IdeaJudgment,
  judgmentId: string,
  usage?: Omit<ApiUsageContext, "operation">
): Promise<IdeaSignalRepairReport> {
  const promptJudgment = compactJudgmentForDeepDivePrompt(judgment, "IDEA_SIGNAL_REPAIR");
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const report = await callKimiJson({
        schema: IdeaSignalRepairReportSchema,
        system: ideaSignalRepairSystemPrompt,
        user: ideaSignalRepairUserPrompt({ judgment: { ...promptJudgment, judgmentId } }),
        temperature: attempt === 0 ? 0.25 : 0.08,
        usage: usage ? { ...usage, judgmentId, operation: "deep_dive_signal_repair" } : { judgmentId, operation: "deep_dive_signal_repair" }
      });

      return {
        ...report,
        mode: "IDEA_SIGNAL_REPAIR",
        judgmentId,
        disclaimer: ensureRepairDisclaimer(report.disclaimer),
        evidenceSourceIds: filterTraceableSourceIds(report.evidenceSourceIds, judgment),
        generatedAt: report.generatedAt || new Date().toISOString()
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Idea Signal Repair generation failed";
    }
  }

  throw new DeepDiveGenerationError(lastError || "Idea Signal Repair generation failed");
}

function compactJudgmentForDeepDivePrompt(judgment: IdeaJudgment, mode: DeepDiveMode): IdeaJudgment {
  const maxSources = mode === "EVIDENCE_EXECUTION" ? 6 : 4;
  const promptSources = selectPromptSources(judgment, maxSources, mode).map((source) => compactSourceForPrompt(source, mode));

  return {
    ...judgment,
    interpretedIdea: truncateText(judgment.interpretedIdea, 700),
    verdictText: truncateText(judgment.verdictText, 500),
    verdictReason: truncateText(judgment.verdictReason, 600),
    searchQueries: judgment.searchQueries.slice(0, mode === "EVIDENCE_EXECUTION" ? 10 : 6).map((query) => truncateText(query, 140)),
    scannedSources: promptSources,
    accessibleSources: [],
    inaccessibleSources: [],
    strongSignals: [],
    mediumSignals: [],
    weakSignals: [],
    irrelevantSources: [],
    opportunities: mode === "EVIDENCE_EXECUTION" ? judgment.opportunities.slice(0, 3).map(compactOpportunity) : [],
    todayAction: compactTodayAction(judgment.todayAction, mode),
    warnings: judgment.warnings.slice(0, 8).map((warning) => truncateText(warning, 240))
  };
}

function selectPromptSources(judgment: IdeaJudgment, maxSources: number, mode: DeepDiveMode) {
  const seen = new Set<string>();
  return judgment.scannedSources
    .map(enrichSourceRecord)
    .filter((source) => mode !== "EVIDENCE_EXECUTION" || isQualifyingEvidenceSource(source))
    .filter((source) => {
      const key = source.sourceDisplayId ?? source.id ?? source.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => sourcePromptPriority(b) - sourcePromptPriority(a))
    .slice(0, maxSources);
}

function compactSourceForPrompt(source: IdeaJudgment["scannedSources"][number], mode: DeepDiveMode) {
  const textBudget = mode === "EVIDENCE_EXECUTION" ? 360 : 120;
  const extractedText = source.userQuoteOrSummary || source.extractedText || source.rawContent || "";

  return {
    ...source,
    title: truncateText(source.title, 140),
    url: truncateText(source.url, 260),
    query: truncateText(source.query, 180),
    rawContent: undefined,
    extractedText: truncateText(extractedText, textBudget),
    painPoint: truncateText(source.painPoint, 220),
    targetUser: truncateText(source.targetUser, 180),
    userQuoteOrSummary: truncateText(source.userQuoteOrSummary, 260),
    whyThisSignal: truncateText(source.whyThisSignal, 260),
    whyRejected: truncateText(source.whyRejected, 220),
    failureReason: truncateText(source.failureReason, 180)
  };
}

function sourcePromptPriority(source: IdeaJudgment["scannedSources"][number]) {
  let score = 0;
  if (source.evidenceAvailability === "CONFIRMED_CONTENT") score += 50;
  if (source.origin === "USER_PASTED") score += 45;
  if (source.isAccessible) score += 20;
  if (source.signalStrength === "strong") score += 40;
  if (source.signalStrength === "medium") score += 30;
  if (source.signalStrength === "weak") score += 10;
  if (source.paymentSignalLevel === "EXPLICIT") score += 18;
  if (source.paymentSignalLevel === "STRONG") score += 14;
  if (source.paymentSignalLevel === "MEDIUM") score += 8;
  score += Math.min(10, Math.max(0, source.relevanceScore ?? 0));
  return score;
}

function compactOpportunity<T extends IdeaJudgment["opportunities"][number] | undefined>(opportunity: T): T {
  if (!opportunity) return opportunity;

  return {
    ...opportunity,
    productName: truncateText(opportunity.productName, 80),
    oneSentence: truncateText(opportunity.oneSentence, 180),
    targetUser: truncateText(opportunity.targetUser, 160),
    compressedFromOriginalIdea: truncateText(opportunity.compressedFromOriginalIdea, 180),
    painPoint: truncateText(opportunity.painPoint, 180),
    mvpOnly: truncateText(opportunity.mvpOnly, 220),
    doNotBuildYet: opportunity.doNotBuildYet.slice(0, 5).map((item) => truncateText(item, 120)),
    firstThreeDaysBuildPlan: opportunity.firstThreeDaysBuildPlan.slice(0, 5).map((item) => truncateText(item, 140)),
    firstValidationAction: truncateText(opportunity.firstValidationAction, 180),
    monetization: truncateText(opportunity.monetization, 160),
    chinaFit: truncateText(opportunity.chinaFit, 160),
    biggestRisk: truncateText(opportunity.biggestRisk, 180),
    sourceIds: opportunity.sourceIds.slice(0, 8),
    score: opportunity.score
  } as T;
}

function compactTodayAction(action: IdeaJudgment["todayAction"], mode: DeepDiveMode) {
  if (mode === "IDEA_SIGNAL_REPAIR") {
    return {
      ...action,
      description: truncateText(action.description, 120),
      targetUserSearch: {
        keywords: action.targetUserSearch.keywords.slice(0, 6).map((item) => truncateText(item, 60)),
        platforms: action.targetUserSearch.platforms.slice(0, 4).map((item) => truncateText(item, 60)),
        whyTheseKeywords: truncateText(action.targetUserSearch.whyTheseKeywords, 120)
      },
      tasks: [],
      successMetric: {
        metric: truncateText(action.successMetric.metric, 90),
        reasoning: truncateText(action.successMetric.reasoning, 120)
      },
      stopCondition: {
        condition: truncateText(action.stopCondition.condition, 90),
        reasoning: truncateText(action.stopCondition.reasoning, 120)
      },
      outreachScript: {
        publicComment: "",
        directMessage: ""
      },
      evidenceSummary: {
        ...action.evidenceSummary,
        sourceTitles: action.evidenceSummary.sourceTitles.slice(0, 4).map((item) => truncateText(item, 80)),
        reasoning: action.evidenceSummary.reasoning.slice(0, 3).map((item) => truncateText(item, 120))
      },
      evidenceSourceIds: action.evidenceSourceIds.slice(0, 6)
    };
  }

  return {
    ...action,
    description: truncateText(action.description, 240),
    targetUserSearch: {
      ...action.targetUserSearch,
      keywords: action.targetUserSearch.keywords.slice(0, 10).map((item) => truncateText(item, 80)),
      platforms: action.targetUserSearch.platforms.slice(0, 8).map((item) => truncateText(item, 80)),
      whyTheseKeywords: truncateText(action.targetUserSearch.whyTheseKeywords, 220)
    },
    tasks: action.tasks.slice(0, 5).map((task) => ({
      ...task,
      task: truncateText(task.task, 160),
      purpose: truncateText(task.purpose, 180),
      evidenceSourceIds: task.evidenceSourceIds.slice(0, 8)
    })),
    successMetric: {
      ...action.successMetric,
      metric: truncateText(action.successMetric.metric, 140),
      reasoning: truncateText(action.successMetric.reasoning, 220)
    },
    stopCondition: {
      ...action.stopCondition,
      condition: truncateText(action.stopCondition.condition, 140),
      reasoning: truncateText(action.stopCondition.reasoning, 220)
    },
    outreachScript: {
      publicComment: truncateText(action.outreachScript.publicComment, 260),
      directMessage: truncateText(action.outreachScript.directMessage, 260)
    },
    evidenceSummary: {
      ...action.evidenceSummary,
      sourceTitles: action.evidenceSummary.sourceTitles.slice(0, 8).map((item) => truncateText(item, 120)),
      reasoning: action.evidenceSummary.reasoning.slice(0, 6).map((item) => truncateText(item, 180))
    },
    evidenceSourceIds: action.evidenceSourceIds.slice(0, 10)
  };
}

function truncateText(value: string, maxLength: number): string;
function truncateText(value: undefined, maxLength: number): undefined;
function truncateText(value: string | undefined, maxLength: number): string | undefined;
function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return value;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

export function filterEvidenceExecutionSourceIds(ids: string[], judgment: IdeaJudgment) {
  const validIds = new Set(
    judgment.scannedSources
      .map(enrichSourceRecord)
      .filter(isQualifyingEvidenceSource)
      .map((source) => source.sourceDisplayId ?? source.id)
  );
  return Array.from(new Set(ids.filter((id) => validIds.has(id))));
}

function filterTraceableSourceIds(ids: string[], judgment: IdeaJudgment) {
  const validIds = new Set(
    judgment.scannedSources
      .map(enrichSourceRecord)
      .filter(
        (source) =>
          source.origin === "USER_PASTED" ||
          ((source.verificationStatus === "ACCESSIBLE" || source.verificationStatus === "REDIRECTED_ACCESSIBLE") &&
            source.evidenceAvailability === "CONFIRMED_CONTENT")
      )
      .map((source) => source.sourceDisplayId ?? source.id)
  );
  return Array.from(new Set(ids.filter((id) => validIds.has(id))));
}

function ensureRepairDisclaimer(value: string) {
  if (value.includes("没有验证") || value.includes("未验证")) return value;
  return `当前没有验证需求，不能当作已确认机会。${value}`;
}
