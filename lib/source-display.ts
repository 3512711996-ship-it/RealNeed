import type {
  DemandSignalStrength,
  EvidenceEligibility,
  EvidenceReasonCode,
  ScannedSource,
  SourceOrigin,
  SourceRecordType,
  SourceVerificationStatus,
  VerificationOrigin
} from "@/lib/types";

const evidenceReasonLabels: Record<EvidenceReasonCode, string> = {
  NON_USER_SOURCE: "不是用户真实讨论",
  COMMERCIAL_CONTENT: "属于商业推广或营销内容",
  OFFICIAL_CONTENT: "属于官方产品页或官方文档",
  MEDIA_CONTENT: "属于新闻、媒体评测或工具对比内容",
  NO_CONCRETE_USER: "没有说明具体是哪类用户遇到问题",
  NO_CONCRETE_SCENARIO: "没有说明问题发生的具体场景",
  KEYWORD_ONLY_MATCH: "只是关键词相关，没有出现具体痛点",
  NO_QUALIFYING_EXCERPT: "没有找到可追溯到正文的用户原话",
  DUPLICATE_DISCUSSION: "与其他来源属于同一组重复讨论",
  LOW_RELEVANCE: "与当前产品想法的相关度较低",
  PAYMENT_SIGNAL_ONLY: "只有价格或付费信息，不能单独证明需求",
  BACKGROUND_INFORMATION_ONLY: "只能作为背景信息，不能作为用户需求证据",
  DIRECT_VERIFICATION_REQUIRED: "原网页没有通过 RealNeed 的直接访问验证",
  CONTENT_EXTRACTION_REQUIRED: "没有获得足够的可分析正文",
  PROMPT_INJECTION_DETECTED: "页面包含疑似干扰 AI 判断的提示内容"
};

const verificationStatusLabels: Record<SourceVerificationStatus, string> = {
  ACCESSIBLE: "可直接访问",
  REDIRECTED_ACCESSIBLE: "跳转后可访问",
  BLOCKED: "网站拒绝服务器访问",
  RATE_LIMITED: "触发访问频率限制",
  NOT_FOUND: "页面不存在",
  TIMEOUT: "访问超时",
  INVALID_URL: "链接无效",
  NETWORK_ERROR: "网络连接失败",
  UNSUPPORTED_CONTENT: "内容类型不支持",
  BODY_TOO_LARGE: "页面内容超过安全上限",
  REDIRECT_BLOCKED: "跳转目标被安全规则拦截",
  UNVERIFIED: "尚未直接验证"
};

const sourceTypeLabels: Record<SourceRecordType, string> = {
  USER_DISCUSSION: "用户讨论",
  USER_REVIEW: "用户评价",
  QUESTION_ANSWER: "问答讨论",
  SUPPORT_REQUEST: "求助记录",
  COMMUNITY_POST: "社区帖子",
  USER_COMPLAINT: "用户抱怨",
  MARKETPLACE_LISTING: "商品或服务列表",
  PAID_SERVICE: "付费服务页",
  OFFICIAL_PRODUCT_PAGE: "官方产品页",
  COMMERCIAL_PROMOTION: "商业推广",
  SEO_ARTICLE: "SEO 文章",
  TUTORIAL: "教程",
  NEWS_ARTICLE: "新闻文章",
  MEDIA_REVIEW: "媒体评测",
  TOOL_COMPARISON: "工具对比",
  AFFILIATE_PAGE: "联盟营销页面",
  MARKET_REPORT_SUMMARY: "市场报告摘要",
  VENDOR_DOCUMENTATION: "厂商文档",
  LANDING_PAGE: "营销落地页",
  UNKNOWN: "暂未识别"
};

const eligibilityLabels: Record<EvidenceEligibility, string> = {
  ELIGIBLE_USER_EVIDENCE: "可计入用户需求证据",
  BACKGROUND_ONLY: "仅作背景信息",
  COMPETITOR_ONLY: "仅作竞品信息",
  IRRELEVANT: "与当前想法无关",
  UNVERIFIED: "尚未满足验证条件"
};

const strengthLabels: Record<DemandSignalStrength, string> = {
  strong: "强信号",
  medium: "中等信号",
  weak: "弱信号",
  irrelevant: "无关来源"
};

const originLabels: Record<SourceOrigin, string> = {
  SEARCH_PROVIDER: "搜索服务发现",
  USER_PASTED: "用户粘贴内容",
  USER_URL: "用户提供链接",
  MANUAL_IMPORT: "人工导入",
  UNTRUSTED_LEGACY_SOURCE: "历史隔离来源"
};

const verificationOriginLabels: Record<VerificationOrigin, string> = {
  LIVE: "本次实时验证",
  CACHE: "验证缓存",
  MANUAL: "用户粘贴"
};

export function formatEvidenceReasonCodes(codes: EvidenceReasonCode[] | undefined) {
  if (!codes?.length) return "没有满足正式证据所需的完整条件";
  return Array.from(new Set(codes)).map((code) => evidenceReasonLabels[code] ?? "未通过其他证据审核规则").join("；");
}

export function formatExtractionFailureReason(reason: string | undefined) {
  if (!reason) return "";
  if (containsChinese(reason)) return ensureSentence(reason);

  const normalized = reason.toLowerCase();
  if (normalized.includes("too little analyzable text")) {
    return "正文提取成功，但页面里的可分析文字太少，不能据此判断用户需求。";
  }
  if (normalized.includes("failed to fetch url") || normalized.includes("tavily extract failed") || normalized.includes("fetch failed")) {
    return "正文提取服务未能读取该页面。搜索线索会保留，但不会被当作已提取的需求证据。";
  }
  if (normalized.includes("timeout")) {
    return "正文提取超时，本次没有获得可分析内容。";
  }
  return "正文提取失败，系统没有获得足够内容用于需求判断。";
}

export function formatDirectVerificationReason(
  reason: string | undefined,
  status: SourceVerificationStatus | undefined,
  statusCode?: number | null
) {
  if (statusCode === 403 || status === "BLOCKED") {
    return "网站拒绝 RealNeed 服务器访问。这不代表链接不存在，但本次不能把它计入正式证据。";
  }
  if (statusCode === 429 || status === "RATE_LIMITED") {
    return "网站触发了访问频率限制，本次无法完成直接验证。";
  }
  if (statusCode === 404 || status === "NOT_FOUND") {
    return "原网页返回 404，本次确认页面不可用。";
  }
  if (status === "TIMEOUT") {
    return "RealNeed 服务器访问原网页超时，本次没有完成直接验证。";
  }
  if (status === "NETWORK_ERROR") {
    return "RealNeed 服务器连接原网页失败，可能是网络异常、网站拦截或目标站暂时不可用。";
  }
  if (status === "INVALID_URL") {
    return "来源链接格式无效，无法执行直接验证。";
  }
  if (status === "UNSUPPORTED_CONTENT") {
    return "原网页不是当前支持的文本内容类型，因此没有进入证据分析。";
  }
  if (status === "BODY_TOO_LARGE") {
    return "原网页内容超过安全读取上限，因此停止验证。";
  }
  if (status === "REDIRECT_BLOCKED") {
    return "网页跳转到了不允许访问的地址，已被安全规则拦截。";
  }
  if (status === "UNVERIFIED") {
    return "本次尚未完成对原网页的直接访问验证。";
  }
  if (!reason) return "";
  if (containsChinese(reason)) return ensureSentence(reason);

  const normalized = reason.toLowerCase();
  if (normalized.includes("fetch failed") || normalized.includes("network") || normalized.includes("econn")) {
    return "RealNeed 服务器连接原网页失败，可能是网络异常、网站拦截或目标站暂时不可用。";
  }
  if (normalized.includes("timeout")) {
    return "RealNeed 服务器访问原网页超时，本次没有完成直接验证。";
  }
  return "原网页直接验证失败，系统没有把该来源计入正式证据。";
}

export function formatSignalExplanation(source: ScannedSource) {
  const strength = source.finalEvidenceStrength ?? source.signalStrength ?? "irrelevant";
  const reasons = formatEvidenceReasonCodes(source.hardRuleReasonCodes);

  if (strength === "weak" || strength === "irrelevant" || source.evidenceEligibility !== "ELIGIBLE_USER_EVIDENCE") {
    return `未计入正式证据：${reasons}。`;
  }

  const explanation = source.whyThisSignal?.trim();
  if (explanation && containsChinese(explanation)) return ensureSentence(explanation);
  if (strength === "strong") return "来源包含具体用户、具体场景和明确痛点，并出现重复问题、主动找方案或现有替代方案不满。";
  return "来源包含可追溯的用户问题和具体场景，但行为强度或重复程度还不足以判定为强信号。";
}

export function verificationStatusLabel(status: SourceVerificationStatus | undefined) {
  return status ? verificationStatusLabels[status] : "尚未直接验证";
}

export function sourceTypeLabel(type: SourceRecordType | undefined) {
  return type ? sourceTypeLabels[type] : "暂未识别";
}

export function evidenceEligibilityLabel(value: EvidenceEligibility | undefined) {
  return value ? eligibilityLabels[value] : "尚未判断";
}

export function signalStrengthLabel(value: DemandSignalStrength | undefined) {
  return value ? strengthLabels[value] : "尚未判断";
}

export function sourceOriginLabel(value: SourceOrigin | undefined) {
  return value ? originLabels[value] : "来源未标记";
}

export function verificationOriginLabel(value: VerificationOrigin | undefined) {
  return value ? verificationOriginLabels[value] : "验证来源未标记";
}

export function searchDiscoveryStatusLabel(value: ScannedSource["searchDiscoveryStatus"]) {
  return value === "SEARCH_DISCOVERED" ? "搜索服务已发现" : "不是搜索发现来源";
}

export function contentExtractionStatusLabel(value: ScannedSource["contentExtractionStatus"]) {
  const labels: Record<NonNullable<ScannedSource["contentExtractionStatus"]>, string> = {
    CONTENT_EXTRACTED: "已提取正文",
    EXTRACTION_FAILED: "正文提取失败",
    INSUFFICIENT_TEXT: "可分析文字过少",
    NOT_RUN: "未执行正文提取"
  };
  return value ? labels[value] : "未执行正文提取";
}

function containsChinese(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function ensureSentence(value: string) {
  const trimmed = value.trim();
  return /[。！？.!?]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}
