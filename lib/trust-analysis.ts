import { createHash } from "node:crypto";
import { applyEvidenceHardRules, isCommercialSourceType, isEligibleUserSourceType, isQualifyingEvidenceSource } from "@/lib/evidence-policy";
import type {
  IdeaJudgment,
  JudgmentConfidence,
  JudgmentDimension,
  MarketScope,
  MarketVerdict,
  PaymentSignalLevel,
  ScannedSource,
  SourceRecordType,
  TechnicalOutcome,
  VerdictType
} from "@/lib/types";

const domesticHosts = ["zhihu.com", "xiaohongshu.com", "douyin.com", "weibo.com", "bilibili.com", "sspai.com", "juejin.cn"];
const overseasHosts = ["reddit.com", "quora.com", "stackoverflow.com", "producthunt.com", "indiehackers.com", "medium.com", "youtube.com"];

export type TrustSnapshot = {
  technicalOutcome: TechnicalOutcome;
  marketVerdict: MarketVerdict;
  confidence: JudgmentConfidence;
  dimensions: JudgmentDimension[];
  independentEvidenceCount: number;
  independentDiscussionCount: number;
  qualifyingUserEvidenceCount: number;
  userEvidenceCandidateCount: number;
  backgroundSourceCount: number;
  commercialSourceCount: number;
  verificationCoveragePercent: number;
  domesticSignalCount: number;
  overseasSignalCount: number;
  paymentSignalLevel: PaymentSignalLevel;
  canShowOverallScore: boolean;
};

export function enrichJudgmentTrust(judgment: IdeaJudgment): IdeaJudgment {
  const enrichedSources = judgment.scannedSources.map(enrichSourceRecord);
  const accessibleSources = enrichedSources.filter((source) => source.isAccessible || source.origin === "USER_PASTED");
  const inaccessibleSources = enrichedSources.filter((source) => !source.isAccessible && source.origin !== "USER_PASTED");
  const strongSignals = accessibleSources.filter((source) => source.finalEvidenceStrength === "strong");
  const mediumSignals = accessibleSources.filter((source) => source.finalEvidenceStrength === "medium");
  const weakSignals = enrichedSources.filter((source) => source.finalEvidenceStrength === "weak");
  const irrelevantSources = enrichedSources.filter((source) => source.finalEvidenceStrength === "irrelevant");

  const enrichedJudgment: IdeaJudgment = {
    ...judgment,
    scannedSources: enrichedSources,
    accessibleSources,
    inaccessibleSources,
    strongSignals,
    mediumSignals,
    weakSignals,
    irrelevantSources
  };

  const snapshot = buildTrustSnapshot(enrichedJudgment);
  const marketVerdict = snapshot.marketVerdict === "NOT_AVAILABLE" ? "KILL_OR_REFRAME" : (snapshot.marketVerdict as VerdictType);
  const opportunities = snapshot.independentEvidenceCount >= 2 ? enrichedJudgment.opportunities : [];

  return {
    ...enrichedJudgment,
    technicalOutcome: snapshot.technicalOutcome,
    marketVerdict: snapshot.marketVerdict,
    confidence: snapshot.confidence,
    dimensions: snapshot.dimensions,
    canShowOverallScore: snapshot.canShowOverallScore,
    independentEvidenceCount: snapshot.independentEvidenceCount,
    independentDiscussionCount: snapshot.independentDiscussionCount,
    qualifyingIndependentEvidenceCount: snapshot.independentEvidenceCount,
    qualifyingUserEvidenceCount: snapshot.qualifyingUserEvidenceCount,
    userEvidenceCandidateCount: snapshot.userEvidenceCandidateCount,
    backgroundSourceCount: snapshot.backgroundSourceCount,
    commercialSourceCount: snapshot.commercialSourceCount,
    verificationCoveragePercent: snapshot.verificationCoveragePercent,
    domesticSignalCount: snapshot.domesticSignalCount,
    overseasSignalCount: snapshot.overseasSignalCount,
    paymentSignalLevel: snapshot.paymentSignalLevel,
    marketTransferability: buildMarketTransferability(snapshot, enrichedSources),
    verdict: snapshot.marketVerdict === "NOT_AVAILABLE" ? "KILL_OR_REFRAME" : marketVerdict,
    verdictText: buildMarketVerdictText(snapshot.marketVerdict, snapshot.technicalOutcome),
    verdictReason: buildMarketVerdictReason(snapshot, enrichedJudgment),
    opportunities
  };
}

export function buildTrustSnapshot(judgment: IdeaJudgment): TrustSnapshot {
  const enrichedSources = judgment.scannedSources.map(enrichSourceRecord);
  const qualifyingSources = enrichedSources.filter(isQualifyingEvidenceSource);
  const confirmedContentCount = enrichedSources.filter(
    (source) => (source.evidenceAvailability === "CONFIRMED_CONTENT" && source.isAccessible) || source.origin === "USER_PASTED"
  ).length;
  const userEvidenceCandidates = enrichedSources.filter(
    (source) => isEligibleUserSourceType(source.sourceType) && ((source.evidenceAvailability === "CONFIRMED_CONTENT" && source.isAccessible) || source.origin === "USER_PASTED")
  );
  const independentKeys = new Set(qualifyingSources.map((source) => source.discussionClusterKey ?? source.contentHash ?? source.id));
  const independentCandidateKeys = new Set(userEvidenceCandidates.map((source) => source.discussionClusterKey ?? source.contentHash ?? source.id));
  const independentEvidenceCount = independentKeys.size;
  const independentDiscussionCount = independentCandidateKeys.size;
  const qualifyingUserEvidenceCount = qualifyingSources.length;
  const userEvidenceCandidateCount = userEvidenceCandidates.length;
  const backgroundSourceCount = enrichedSources.filter((source) => source.evidenceEligibility === "BACKGROUND_ONLY" || source.evidenceEligibility === "COMPETITOR_ONLY").length;
  const commercialSourceCount = enrichedSources.filter((source) => isCommercialSourceType(source.sourceType)).length;
  const coverage = judgment.verificationCoverage;
  const completed = coverage?.completedCount ?? judgment.scannedSources.length;
  const total = coverage?.deduplicatedCandidates ?? judgment.scannedSources.length;
  const verificationCoveragePercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const partial = Boolean(coverage?.partial);
  const domesticSignalCount = qualifyingSources.filter((source) => source.marketScope === "DOMESTIC" || source.marketScope === "CROSS_MARKET").length;
  const overseasSignalCount = qualifyingSources.filter((source) => source.marketScope === "OVERSEAS" || source.marketScope === "CROSS_MARKET").length;
  const paymentSignalLevel = maxPaymentSignal(qualifyingSources);
  const technicalOutcome = deriveTechnicalOutcome(judgment, independentEvidenceCount, confirmedContentCount, qualifyingUserEvidenceCount);
  const marketVerdict = deriveMarketVerdict(judgment.verdict, technicalOutcome, independentEvidenceCount, paymentSignalLevel);
  const confidence = deriveConfidence({
    independentEvidenceCount,
    accessibleCount: confirmedContentCount,
    partial,
    paymentSignalLevel,
    promptInjectionDetected: judgment.scannedSources.some((source) => source.promptInjectionDetected)
  });
  const canShowOverallScore = confidence === "MEDIUM" || confidence === "HIGH";

  return {
    technicalOutcome,
    marketVerdict,
    confidence,
    dimensions: buildDimensions(judgment, independentEvidenceCount, paymentSignalLevel, domesticSignalCount, overseasSignalCount, confidence, canShowOverallScore),
    independentEvidenceCount,
    independentDiscussionCount,
    qualifyingUserEvidenceCount,
    userEvidenceCandidateCount,
    backgroundSourceCount,
    commercialSourceCount,
    verificationCoveragePercent,
    domesticSignalCount,
    overseasSignalCount,
    paymentSignalLevel,
    canShowOverallScore
  };
}

export function enrichSourceRecord(source: ScannedSource): ScannedSource {
  const host = getHost(source.finalUrl || source.normalizedUrl || source.url);
  const text = `${source.title} ${source.extractedText ?? ""} ${source.userQuoteOrSummary ?? ""} ${source.painPoint ?? ""}`;
  const sourceType = source.sourceType && source.sourceType !== "UNKNOWN" ? source.sourceType : classifySourceType(source, host, text);
  const paymentSignalLevel = classifyPaymentSignal(text);
  const marketScope = classifyMarketScope(host, text);
  const contentHash = hashText(`${source.title}\n${source.extractedText ?? source.userQuoteOrSummary ?? ""}`.slice(0, 1200));
  const discussionClusterKey = buildDiscussionClusterKey(source, host, contentHash);
  const promptInjectionDetected = detectPromptInjection(text);

  const enriched: ScannedSource = {
    ...source,
    sourceType,
    paymentSignalLevel,
    marketScope,
    contentHash,
    discussionClusterKey,
    promptInjectionDetected
  };
  const policy = applyEvidenceHardRules(enriched);
  return {
    ...enriched,
    ...policy,
    signalStrength: policy.finalEvidenceStrength,
    whyRejected:
      policy.evidenceEligibility === "ELIGIBLE_USER_EVIDENCE"
        ? enriched.whyRejected
        : `未计入正式证据：${policy.hardRuleReasonCodes.join(", ") || "不满足证据硬规则"}`
  };
}

export function deriveTechnicalOutcome(judgment: IdeaJudgment, independentEvidenceCount: number, confirmedContentCount = 0, userEvidenceCount = 0): TechnicalOutcome {
  if (
    judgment.technicalOutcome &&
    judgment.technicalOutcome !== "READY" &&
    judgment.technicalOutcome !== "INSUFFICIENT_EVIDENCE" &&
    judgment.technicalOutcome !== "VERIFICATION_INCOMPLETE" &&
    judgment.technicalOutcome !== "PROCESSING_FAILED"
  ) {
    return judgment.technicalOutcome;
  }

  const coverage = judgment.verificationCoverage;

  if (judgment.scannedSources.length === 0 && (coverage?.totalCandidates ?? 0) === 0) return "SEARCH_FAILED";

  if (coverage?.partial && independentEvidenceCount < 2) return "VERIFICATION_INCOMPLETE";

  if (judgment.accessibleSources.length === 0 && judgment.scannedSources.length > 0) {
    const blockedLike = judgment.scannedSources.filter((source) => source.verificationStatus === "BLOCKED" || source.verificationStatus === "RATE_LIMITED").length;
    return blockedLike > 0 ? "SOURCES_BLOCKED" : "INSUFFICIENT_EVIDENCE";
  }

  if (confirmedContentCount < 3 || independentEvidenceCount < 2 || userEvidenceCount < 2) return "INSUFFICIENT_EVIDENCE";
  if (coverage?.partial) return "VERIFICATION_INCOMPLETE";
  return "READY";
}

function deriveMarketVerdict(
  originalVerdict: VerdictType,
  technicalOutcome: TechnicalOutcome,
  independentEvidenceCount: number,
  paymentSignalLevel: PaymentSignalLevel
): MarketVerdict {
  if (technicalOutcome !== "READY" || independentEvidenceCount < 2) return "NOT_AVAILABLE";

  if (originalVerdict === "BUILD_SMALL_MVP" && (paymentSignalLevel === "NONE" || paymentSignalLevel === "WEAK")) return "VALIDATE_FIRST";
  return originalVerdict;
}

function deriveConfidence({
  independentEvidenceCount,
  accessibleCount,
  partial,
  paymentSignalLevel,
  promptInjectionDetected
}: {
  independentEvidenceCount: number;
  accessibleCount: number;
  partial: boolean;
  paymentSignalLevel: PaymentSignalLevel;
  promptInjectionDetected: boolean;
}): JudgmentConfidence {
  if (promptInjectionDetected || independentEvidenceCount === 0) return "VERY_LOW";
  if (independentEvidenceCount < 2 || partial) return "LOW";
  if (independentEvidenceCount >= 4 && accessibleCount >= 6 && ["MEDIUM", "STRONG", "EXPLICIT"].includes(paymentSignalLevel)) return "HIGH";
  return "MEDIUM";
}

function buildDimensions(
  judgment: IdeaJudgment,
  independentEvidenceCount: number,
  paymentSignalLevel: PaymentSignalLevel,
  domesticSignalCount: number,
  overseasSignalCount: number,
  confidence: JudgmentConfidence,
  canShowOverallScore: boolean
): JudgmentDimension[] {
  const score = judgment.scores;
  const maybe = (value: number) => (canShowOverallScore ? value : null);

  return [
    {
      key: "evidence_strength",
      label: "证据强度",
      value: maybe(score.demandSignal),
      confidence,
      note: `独立需求证据 ${independentEvidenceCount} 条；低于 2 条时不生成方向。`
    },
    {
      key: "payment_signal",
      label: "付费信号",
      value: maybe(score.paymentSignal),
      confidence,
      note: `当前付费信号等级：${paymentSignalLevel}。`
    },
    {
      key: "beginner_feasibility",
      label: "新手可做",
      value: maybe(score.beginnerFeasibility),
      confidence,
      note: "只评估低成本 MVP，不评估完整产品。"
    },
    {
      key: "mvp_simplicity",
      label: "MVP 简单度",
      value: maybe(score.mvpSimplicity),
      confidence,
      note: "第一版应优先表单、人工交付、手动粘贴和小范围验证。"
    },
    {
      key: "domestic_fit",
      label: "国内适配",
      value: maybe(domesticSignalCount > 0 ? 72 : overseasSignalCount > 0 ? 46 : 36),
      confidence,
      note: `国内线索 ${domesticSignalCount} 条，海外线索 ${overseasSignalCount} 条；海外痛点不能直接等同于中国付费需求。`
    },
    {
      key: "independence",
      label: "证据独立性",
      value: maybe(Math.min(100, independentEvidenceCount * 28)),
      confidence,
      note: "同一帖子、同一页面或高度相似内容只按一组独立证据计算。"
    }
  ];
}

function classifySourceType(source: ScannedSource, host: string, text: string): SourceRecordType {
  const lower = `${host} ${source.platform} ${text}`.toLowerCase();

  if (source.origin === "USER_PASTED") return "USER_DISCUSSION";

  if (/reddit|v2ex|indiehackers|community|forum|论坛|社区帖子/.test(lower)) return "COMMUNITY_POST";
  if (/zhihu|xiaohongshu|weibo|douyin|quora/.test(lower)) return "USER_DISCUSSION";
  if (/app store|play\.google|g2\.com|trustpilot|customer review|user review|用户评价|用户评分/.test(lower)) return "USER_REVIEW";
  if (/stackoverflow|stackexchange|segmentfault|问答/.test(lower)) return "QUESTION_ANSWER";
  if (/support request|help center.*question|求助|技术支持|客服问题/.test(lower)) return "SUPPORT_REQUEST";
  if (/affiliate|referral|佣金|返利|推广链接/.test(lower)) return "AFFILIATE_PAGE";
  if (/\b(best|top \d+|vs\.?|comparison|compare)\b|哪[个款].*好|排行榜|工具对比|优缺点比较/.test(lower)) return "TOOL_COMPARISON";
  if (/media review|\breview\b|测评|评测|开箱|体验报告/.test(lower)) return "MEDIA_REVIEW";
  if (/market report|market size|research report|市场报告|行业报告|市场规模/.test(lower)) return "MARKET_REPORT_SUMMARY";
  if (/docs\.|documentation|developer docs|learn\.microsoft|aws\.amazon|文档|开发指南/.test(lower)) return "VENDOR_DOCUMENTATION";
  if (/pricing|price|subscription|套餐|购买|付费服务|服务报价/.test(lower)) return "PAID_SERVICE";
  if (/official|官网|download|features|产品功能/.test(lower)) return "OFFICIAL_PRODUCT_PAGE";
  if (/sponsored|advertisement|affiliate|推广|广告|软文/.test(lower)) return "COMMERCIAL_PROMOTION";
  if (/tutorial|step by step|how to|教程|攻略/.test(lower)) return "TUTORIAL";
  if (/seo|ultimate guide|complete guide|指南大全/.test(lower)) return "SEO_ARTICLE";
  if (/news|press release|新闻|发布|融资/.test(lower)) return "NEWS_ARTICLE";
  if (/sign up|start free|try now|立即体验|免费试用|联系我们/.test(lower)) return "LANDING_PAGE";
  if (/i hate|i am tired of|i'm tired of|complaint|抱怨|吐槽|投诉/.test(lower)) return "USER_COMPLAINT";
  return "UNKNOWN";
}

function classifyPaymentSignal(text: string): PaymentSignalLevel {
  const lower = text.toLowerCase();
  if (/willing to pay|paid .* for|subscription|pricing|invoice|client budget|付费|愿意花钱|报价|订阅|收款|客单价/.test(lower)) return "EXPLICIT";
  if (/expensive|costs?|price|收费|太贵|成本|预算/.test(lower)) return "STRONG";
  if (/business|client|freelancer|公司|客户|老板|团队|商家|接单/.test(lower)) return "MEDIUM";
  if (/time consuming|manual|spreadsheet|excel|重复|耗时|手动|表格/.test(lower)) return "WEAK";
  return "NONE";
}

function classifyMarketScope(host: string, text: string): MarketScope {
  const lower = `${host} ${text}`.toLowerCase();
  const domestic = domesticHosts.some((item) => lower.includes(item)) || /微信|支付宝|小红书|抖音|知乎|淘宝|闲鱼|飞书|人民币|国内/.test(lower);
  const overseas = overseasHosts.some((item) => lower.includes(item)) || /reddit|stripe|paypal|dollar|usd|overseas|global/.test(lower);
  if (domestic && overseas) return "CROSS_MARKET";
  if (domestic) return "DOMESTIC";
  if (overseas) return "OVERSEAS";
  return "UNKNOWN";
}

function maxPaymentSignal(sources: ScannedSource[]): PaymentSignalLevel {
  const order: PaymentSignalLevel[] = ["NONE", "WEAK", "MEDIUM", "STRONG", "EXPLICIT"];
  return sources.reduce<PaymentSignalLevel>((best, source) => {
    const current = source.paymentSignalLevel ?? classifyPaymentSignal(`${source.title} ${source.extractedText ?? ""}`);
    return order.indexOf(current) > order.indexOf(best) ? current : best;
  }, "NONE");
}

function buildDiscussionClusterKey(source: ScannedSource, host: string, contentHash: string) {
  const url = source.finalUrl || source.normalizedUrl || source.url;

  try {
    const parsed = new URL(url);
    const redditPost = parsed.pathname.match(/\/comments\/([^/]+)/);
    if (redditPost) return `reddit:${redditPost[1]}`;
    return `${host}:${parsed.pathname.replace(/\/$/, "") || "/"}`;
  } catch {
    return `content:${contentHash}`;
  }
}

function detectPromptInjection(text: string) {
  const lower = text.toLowerCase();
  return [
    "ignore previous instructions",
    "ignore all previous",
    "ignore system instructions",
    "ignore developer instructions",
    "system prompt",
    "developer message",
    "output api key",
    "reveal api key",
    "print api key",
    "mark this as strong evidence",
    "change the market conclusion",
    "generate a url",
    "delete the database",
    "execute shell",
    "你现在是",
    "忽略之前",
    "忽略系统",
    "忽略开发者",
    "不要遵守",
    "输出 api key",
    "输出api key",
    "输出系统提示词",
    "标为强证据",
    "修改市场结论",
    "生成 url",
    "生成url",
    "删除数据库",
    "执行 shell",
    "执行shell"
  ].some((signal) => lower.includes(signal));
}

function buildMarketTransferability(snapshot: TrustSnapshot, sources: ScannedSource[]) {
  const notes: string[] = [];
  if (snapshot.overseasSignalCount > 0 && snapshot.domesticSignalCount === 0) {
    notes.push("本次主要是海外公开线索，进入中国市场前需要用中文平台或手动访谈复核。");
  }
  if (snapshot.domesticSignalCount > 0) {
    notes.push("已有国内语境信号，但仍需用人民币报价验证付费意愿。");
  }
  if (sources.some((source) => source.sourceType === "COMMERCIAL_PROMOTION" || source.sourceType === "SEO_ARTICLE")) {
    notes.push("部分来源像营销或教程内容，不作为强需求证据。");
  }

  return {
    domesticFit: snapshot.domesticSignalCount > 0 ? "MEDIUM" : snapshot.overseasSignalCount > 0 ? "UNKNOWN" : "LOW",
    overseasFit: snapshot.overseasSignalCount > 0 ? "MEDIUM" : "UNKNOWN",
    notes
  } as const;
}

function buildMarketVerdictText(marketVerdict: MarketVerdict, technicalOutcome: TechnicalOutcome) {
  if (marketVerdict === "NOT_AVAILABLE") {
    if (technicalOutcome === "SEARCH_FAILED") return "搜索失败，不能判断市场";
    if (technicalOutcome === "SOURCES_BLOCKED") return "来源被阻断，不能判断市场";
    if (technicalOutcome === "VERIFICATION_INCOMPLETE") return "验证未完成，暂不生成方向";
    return "证据不足，暂不生成方向";
  }

  const map = {
    BUILD_SMALL_MVP: "值得做一个小 MVP",
    VALIDATE_FIRST: "可以先验证，但不要急着开发",
    TALK_TO_USERS: "先找用户聊，不要急着写代码",
    KILL_OR_REFRAME: "不建议直接做，需要换角度"
  } satisfies Record<VerdictType, string>;
  return map[marketVerdict];
}

function buildMarketVerdictReason(snapshot: TrustSnapshot, judgment: IdeaJudgment) {
  if (snapshot.marketVerdict === "NOT_AVAILABLE") {
    return `本次技术状态为 ${snapshot.technicalOutcome}，独立可用证据 ${snapshot.independentEvidenceCount} 条。RealNeed 不会在证据不足时硬生成产品方向。`;
  }

  const scoreNote = snapshot.canShowOverallScore ? `综合维度可展示为 ${judgment.scores.overall}/100。` : "当前置信度较低，不展示精确总分。";
  return `基于 ${snapshot.independentEvidenceCount} 组独立证据，付费信号为 ${snapshot.paymentSignalLevel}。${scoreNote}`;
}

function getHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hashText(text: string) {
  return createHash("sha256").update(text.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex");
}
