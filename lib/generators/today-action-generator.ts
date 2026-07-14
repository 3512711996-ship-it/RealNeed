import { z } from "zod";
import { callKimiJson } from "@/lib/kimi";
import { enrichSourceRecord } from "@/lib/trust-analysis";
import { isQualifyingEvidenceSource } from "@/lib/evidence-policy";
import type { ApiUsageContext } from "@/lib/usage-tracker";
import type { InterpretedIdea, Opportunity, ScannedSource, TodayAction, TodayActionConfidence } from "@/lib/types";

const userEvidenceTypes = new Set(["USER_DISCUSSION", "USER_REVIEW", "QUESTION_ANSWER", "SUPPORT_REQUEST", "COMMUNITY_POST", "USER_COMPLAINT"]);

const kimiTodayActionSchema = z.object({
  title: z.string().min(4),
  description: z.string().min(12),
  targetUserSearch: z.object({
    keywords: z.array(z.string().min(2)).min(3).max(8),
    platforms: z.array(z.string().min(2)).min(2).max(6),
    whyTheseKeywords: z.string().min(12)
  }),
  tasks: z
    .array(
      z.object({
        task: z.string().min(8),
        purpose: z.string().min(8),
        evidenceSourceIds: z.array(z.string()).min(1)
      })
    )
    .min(2)
    .max(4),
  successMetric: z.object({
    metric: z.string().min(8),
    reasoning: z.string().min(12)
  }),
  stopCondition: z.object({
    condition: z.string().min(8),
    reasoning: z.string().min(12)
  }),
  outreachScript: z.object({
    publicComment: z.string().min(12),
    directMessage: z.string().min(12)
  }),
  evidenceSourceIds: z.array(z.string()).min(2)
});

export class TodayActionGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TodayActionGenerationError";
  }
}

export async function generateTodayAction({
  idea,
  interpretedIdea,
  sources,
  searchQueries,
  opportunity,
  usage
}: {
  idea: string;
  interpretedIdea: InterpretedIdea;
  sources: ScannedSource[];
  searchQueries: string[];
  opportunity?: Opportunity;
  usage?: Omit<ApiUsageContext, "operation">;
}): Promise<TodayAction> {
  const enrichedSources = sources.map(enrichSourceRecord);
  const evidenceSummary = buildTodayActionEvidenceSummary(enrichedSources);

  if (!canGenerateEvidenceBasedTodayAction(enrichedSources).allowed) {
    return buildHypothesisValidationAction({ idea, interpretedIdea, sources: enrichedSources, searchQueries, evidenceSummary });
  }

  const evidenceSources = getEligibleEvidenceSources(enrichedSources);
  try {
    const generated = await callKimiJson({
      schema: kimiTodayActionSchema,
      system: [
        "你是 RealNeed 的 evidence-first 行动建议生成器。",
        "你只能依据传入的真实来源生成行动建议。",
        "每一个行动、成功指标和停止条件，都必须可以追溯到证据。",
        "禁止使用固定的“找 3 人聊”或“联系 10 人”作为默认答案。",
        "人数和指标必须根据当前证据量、目标用户可触达性和验证目标决定。",
        "禁止编造来源、帖子、平台或 evidenceSourceIds。",
        "如果证据不支持某个行动，不要输出该行动。"
      ].join("\n"),
      user: JSON.stringify(
        {
          originalIdea: idea,
          targetUsers: interpretedIdea.targetUsers,
          usageScenarios: interpretedIdea.possiblePainPoints,
          opportunity,
          independentEvidenceCount: evidenceSummary.independentEvidenceCount,
          confirmedContentCount: evidenceSummary.confirmedContentCount,
          sources: evidenceSources.map((source) => ({
            sourceId: source.id,
            title: source.title,
            url: source.url || null,
            platform: source.platform,
            sourceType: source.sourceType,
            marketScope: source.marketScope,
            evidenceStrength: source.signalStrength,
            painPoint: source.painPoint,
            currentAlternative: source.userQuoteOrSummary,
            paymentSignal: source.paymentSignalLevel,
            extractedText: (source.extractedText ?? source.rawContent ?? "").slice(0, 1600)
          }))
        },
        null,
        2
      ),
      usage: usage ? { ...usage, operation: "today_action_generation" } : undefined
    });

    validateTodayActionSourceIds(generated.evidenceSourceIds, evidenceSources);
    for (const task of generated.tasks) validateTodayActionSourceIds(task.evidenceSourceIds, evidenceSources);

    return {
      mode: "EVIDENCE_BASED",
      title: generated.title,
      description: generated.description,
      targetUserSearch: generated.targetUserSearch,
      tasks: generated.tasks,
      successMetric: generated.successMetric,
      stopCondition: generated.stopCondition,
      outreachScript: generated.outreachScript,
      evidenceSummary: {
        ...evidenceSummary,
        reasoning: [
          ...evidenceSummary.reasoning,
          "Kimi 生成时只传入 CONFIRMED_CONTENT / USER_PASTED 且通过来源门槛的正文片段。"
        ]
      },
      evidenceSourceIds: generated.evidenceSourceIds
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return buildTodayActionFailure({ evidenceSummary, message });
  }
}

export function canGenerateEvidenceBasedTodayAction(sources: ScannedSource[]) {
  const enrichedSources = sources.map(enrichSourceRecord);
  const evidenceSummary = buildTodayActionEvidenceSummary(enrichedSources);
  const eligibleSources = getEligibleEvidenceSources(enrichedSources);
  const userEvidenceCount = eligibleSources.filter((source) => userEvidenceTypes.has(source.sourceType ?? "UNKNOWN")).length;
  const hasAnalyzableText = eligibleSources.every((source) => getSourceText(source).length >= 80);
  const hasLegalOrigins = eligibleSources.every(hasLegalOrigin);
  const allowed =
    evidenceSummary.confirmedContentCount >= 3 &&
    evidenceSummary.independentEvidenceCount >= 2 &&
    userEvidenceCount >= 2 &&
    hasAnalyzableText &&
    hasLegalOrigins;

  return {
    allowed,
    confirmedContentCount: evidenceSummary.confirmedContentCount,
    independentEvidenceCount: evidenceSummary.independentEvidenceCount,
    userEvidenceCount,
    reasons: evidenceSummary.reasoning
  };
}

export function buildTodayActionEvidenceSummary(sources: ScannedSource[]): TodayAction["evidenceSummary"] {
  const enrichedSources = sources.map(enrichSourceRecord);
  const legalConfirmedSources = enrichedSources.filter((source) => hasLegalOrigin(source) && isConfirmedContent(source));
  const eligibleSources = getEligibleEvidenceSources(enrichedSources);
  const independentEvidenceCount = new Set(eligibleSources.map((source) => source.discussionClusterKey ?? source.contentHash ?? source.id)).size;
  const userEvidenceCount = eligibleSources.filter((source) => userEvidenceTypes.has(source.sourceType ?? "UNKNOWN")).length;
  const confidence: TodayActionConfidence =
    legalConfirmedSources.length >= 5 && independentEvidenceCount >= 3 && userEvidenceCount >= 3
      ? "HIGH"
      : legalConfirmedSources.length >= 3 && independentEvidenceCount >= 2 && userEvidenceCount >= 2
        ? "MEDIUM"
        : legalConfirmedSources.length > 0
          ? "LOW"
          : "VERY_LOW";

  const reasoning = [
    `已确认可分析正文 ${legalConfirmedSources.length} 条。`,
    `强/中需求信号形成 ${independentEvidenceCount} 组独立证据。`,
    `用户讨论/测评/问答类型证据 ${userEvidenceCount} 条。`
  ];

  if (legalConfirmedSources.some((source) => source.evidenceAvailability === "SEARCH_LEAD")) {
    reasoning.push("SEARCH_LEAD 没有被计入正式行动依据。");
  }
  if (enrichedSources.some((source) => source.origin === "UNTRUSTED_LEGACY_SOURCE")) {
    reasoning.push("UNTRUSTED_LEGACY_SOURCE 没有被计入行动依据。");
  }

  return {
    confirmedContentCount: legalConfirmedSources.length,
    independentEvidenceCount,
    sourceTitles: eligibleSources.map((source) => source.title).slice(0, 6),
    reasoning,
    confidence
  };
}

export function validateTodayActionSourceIds(sourceIds: string[], sources: ScannedSource[]) {
  const legalIds = new Set(getEligibleEvidenceSources(sources).map((source) => source.id));
  const invalid = sourceIds.filter((id) => !legalIds.has(id));
  if (invalid.length > 0) {
    throw new TodayActionGenerationError(`Today Action 引用了不存在或不合格的 evidenceSourceIds：${invalid.join(", ")}`);
  }
}

export function buildHypothesisValidationAction({
  idea,
  interpretedIdea,
  sources,
  searchQueries,
  evidenceSummary
}: {
  idea: string;
  interpretedIdea: InterpretedIdea;
  sources: ScannedSource[];
  searchQueries: string[];
  evidenceSummary?: TodayAction["evidenceSummary"];
}): TodayAction {
  const summary = evidenceSummary ?? buildTodayActionEvidenceSummary(sources);
  const targetUser = interpretedIdea.targetUsers[0] ?? "最可能遇到这个问题的人";
  const painPoint = interpretedIdea.possiblePainPoints[0] ?? "当前流程是否真的麻烦";
  const baseKeywords = [...interpretedIdea.keywordsZh, ...interpretedIdea.keywordsEn, ...searchQueries.flatMap(splitQuery)].filter(Boolean);
  const keywords = Array.from(new Set(baseKeywords.map(cleanKeyword).filter((item) => item.length >= 2))).slice(0, 6);
  const sampleSize = summary.confirmedContentCount === 0 ? 6 : Math.min(12, Math.max(7, summary.confirmedContentCount * 3));
  const replyTarget = summary.confirmedContentCount === 0 ? 2 : Math.max(2, summary.independentEvidenceCount + 1);

  return {
    mode: "HYPOTHESIS_VALIDATION",
    title: "基于假设的下一步验证",
    description: "当前真实证据不足，下面的行动用于获取证据，不代表 RealNeed 已经确认需求或付费意愿。",
    targetUserSearch: {
      keywords: keywords.length ? keywords : [idea, targetUser, painPoint].map(cleanKeyword).filter(Boolean).slice(0, 3),
      platforms: pickHypothesisPlatforms(idea, interpretedIdea),
      whyTheseKeywords: `这些词来自用户想法、Kimi 的意图拆解和本次搜索词，用于找到可能经历“${painPoint}”的人，而不是作为已确认需求。`
    },
    tasks: [
      {
        task: `找到 ${sampleSize} 个接近“${targetUser}”的人或公开讨论，记录他们现在怎么处理这个问题。`,
        purpose: "先收集真实描述，避免直接开发一个没人承认的问题。",
        evidenceSourceIds: []
      },
      {
        task: "用人工方式提供一次最小帮助，不写完整产品，只验证对方是否愿意继续配合。",
        purpose: "把验证目标从“喜欢想法”改成“愿意交出真实材料或真实时间”。",
        evidenceSourceIds: []
      }
    ],
    successMetric: {
      metric: `今天获得至少 ${replyTarget} 个具体回复，其中至少 1 个愿意提供真实样例或让你人工处理一次。`,
      reasoning: "证据不足时不看点赞或泛泛支持，只看是否愿意暴露真实流程和材料。"
    },
    stopCondition: {
      condition: `如果联系 ${sampleSize} 个“${targetUser}”后，没人愿意围绕“${painPoint}”描述现有解决方式或提供样例，停止开发并重新缩小人群。`,
      reasoning: `停止条件绑定当前目标用户和痛点场景；没有来自“${targetUser}”的真实流程输入，就不能证明这是可做的小产品机会。`
    },
    outreachScript: {
      publicComment: `我在验证一个和“${painPoint}”有关的小工具方向。你现在一般怎么解决？最麻烦的一步是什么？`,
      directMessage: `你好，我正在做一个很早期的需求验证，不卖东西。看到你可能和“${painPoint}”有关，想请教：你现在怎么处理？如果方便，我可以免费帮你人工试处理一次，看这个问题是否真的值得做成工具。`
    },
    evidenceSummary: {
      ...summary,
      reasoning: [...summary.reasoning, "本模块没有把搜索线索当成需求证据。"]
    },
    evidenceSourceIds: []
  };
}

function buildTodayActionFailure({ evidenceSummary, message }: { evidenceSummary: TodayAction["evidenceSummary"]; message: string }): TodayAction {
  return {
    mode: "HYPOTHESIS_VALIDATION",
    title: "行动建议生成失败",
    description: "Kimi 没有成功生成可追溯行动建议。系统没有使用静态模板兜底，请稍后重试或切换手动粘贴模式。",
    targetUserSearch: {
      keywords: [],
      platforms: [],
      whyTheseKeywords: "生成失败，未输出搜索词。"
    },
    tasks: [],
    successMetric: {
      metric: "未生成",
      reasoning: `失败原因：${message.slice(0, 180)}`
    },
    stopCondition: {
      condition: "未生成",
      reasoning: "为了避免伪装成证据分析，系统不会返回模板化停止条件。"
    },
    outreachScript: {
      publicComment: "",
      directMessage: ""
    },
    evidenceSummary: {
      ...evidenceSummary,
      confidence: "VERY_LOW",
      reasoning: [...evidenceSummary.reasoning, "Today Action 生成失败，未使用模板兜底。"]
    },
    evidenceSourceIds: []
  };
}

function getEligibleEvidenceSources(sources: ScannedSource[]) {
  return sources
    .map(enrichSourceRecord)
    .filter((source) => hasLegalOrigin(source))
    .filter((source) => isConfirmedContent(source))
    .filter(isQualifyingEvidenceSource)
    .filter((source) => getSourceText(source).length >= 80);
}

function hasLegalOrigin(source: ScannedSource) {
  if (source.origin === "UNTRUSTED_LEGACY_SOURCE") return false;
  if (source.origin === "USER_PASTED") return true;
  if (source.origin === "SEARCH_PROVIDER") {
    return (
      ["TAVILY", "BRAVE", "EXA", "PERPLEXITY_SEARCH"].includes(source.provider ?? "") &&
      Boolean(source.providerRequestId || source.searchRequestId) &&
      Boolean(source.url)
    );
  }
  return source.origin === "USER_URL" || source.origin === "MANUAL_IMPORT";
}

function isConfirmedContent(source: ScannedSource) {
  return source.evidenceAvailability === "CONFIRMED_CONTENT" || source.origin === "USER_PASTED";
}

function getSourceText(source: ScannedSource) {
  return `${source.extractedText ?? ""} ${source.rawContent ?? ""} ${source.userQuoteOrSummary ?? ""}`.trim();
}

function splitQuery(query: string) {
  return query
    .replace(/site:\S+/g, " ")
    .replace(/["“”]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length >= 2 && !/^(and|or|the|for|with)$/i.test(part));
}

function cleanKeyword(value: string) {
  return value.replace(/\s+/g, " ").replace(/[|{}[\]"“”]/g, "").trim();
}

function pickHypothesisPlatforms(idea: string, interpretedIdea: InterpretedIdea) {
  const text = `${idea} ${interpretedIdea.domain} ${interpretedIdea.targetUsers.join(" ")}`.toLowerCase();
  if (/大学|学生|食堂|校园|宿舍|college|student|campus/.test(text)) return ["小红书", "微信群", "校园表白墙", "贴吧"];
  if (/自由职业|账单|发票|invoice|freelance|client/.test(text)) return ["小红书", "知乎", "即刻", "自由职业者社群"];
  if (/测评|成人|隐私|用品|review/.test(text)) return ["Reddit", "小红书", "知乎", "垂直测评评论区"];
  return ["Reddit", "知乎", "小红书", "相关微信群"];
}
