import type { VerifiedSource } from "@/lib/source-verifier";

export type EvidenceValidationResult = {
  isValid: boolean;
  reason: string;
  confidence: number;
};

export function validateEvidenceSource({
  source,
  idea,
  painPoint,
  sourceText,
  userQuoteOrSummary
}: {
  source: VerifiedSource;
  idea: string;
  painPoint: string;
  sourceText?: string;
  userQuoteOrSummary?: string;
}): EvidenceValidationResult {
  if (!source.isAccessible) {
    return {
      isValid: false,
      reason: source.failureReason ?? "Source is not accessible",
      confidence: 0
    };
  }

  const extractedText = normalize(source.extractedText);

  if (extractedText.length < 80) {
    return { isValid: false, reason: "Source has too little extracted text", confidence: 0 };
  }

  const relevant = isRelatedToIdea(source.extractedText, idea, painPoint, sourceText);
  const demandSignal = hasDemandSignal(source.extractedText);
  const invalidPageType = isWeakOrInvalidEvidencePage(source.extractedText, source.title);
  const summaryFromSource =
    containsLoose(source.extractedText, sourceText) || containsLoose(source.extractedText, userQuoteOrSummary) || containsLoose(source.extractedText, painPoint);

  const failedReasons: string[] = [];
  let confidence = 35;

  if (relevant) confidence += 20;
  else failedReasons.push("Source content is not clearly related to the idea");

  if (demandSignal) confidence += 30;
  else failedReasons.push("Source does not contain a clear complaint, help request, workaround, or repeated hassle");

  if (summaryFromSource) confidence += 15;
  else failedReasons.push("Evidence summary does not appear to come from extracted source text");

  if (invalidPageType) {
    confidence -= 25;
    failedReasons.push("Source looks like tutorial, news, advertisement, or marketing content");
  }

  const isValid = relevant && demandSignal && summaryFromSource && !invalidPageType;

  return {
    isValid,
    reason: isValid ? "Verified source contains relevant demand evidence" : failedReasons.join("; "),
    confidence: clamp(confidence, 0, 100)
  };
}

function isRelatedToIdea(text: string, idea: string, painPoint: string, sourceText?: string) {
  const haystack = normalize(`${text} ${sourceText ?? ""}`);
  const tokens = extractTokens(`${idea} ${painPoint} ${expandCrossLingualKeywords(`${idea} ${painPoint}`).join(" ")}`).filter(
    (token) => token.length >= 2
  );

  if (tokens.length === 0) return true;

  const hits = tokens.filter((token) => haystack.includes(normalize(token))).length;
  return hits >= 1;
}

function expandCrossLingualKeywords(value: string) {
  const lower = value.toLowerCase();
  const expansions: string[] = [];

  if (/记账|账单|预算|expense|budget/.test(lower)) {
    expansions.push("budgeting", "expense", "expenses", "expense tracker", "tracking expenses");
  }

  if (/学习|课程|作业|study|assignment/.test(lower)) {
    expansions.push("study", "student", "assignment", "study planner");
  }

  if (/文案|小红书|内容|caption|content/.test(lower)) {
    expansions.push("caption", "content", "creator", "social media");
  }

  if (/简历|求职|resume|job/.test(lower)) {
    expansions.push("resume", "job application", "cover letter");
  }

  if (/健身|训练|workout|fitness/.test(lower)) {
    expansions.push("workout", "fitness", "training");
  }

  return expansions;
}

function hasDemandSignal(text: string) {
  const lower = text.toLowerCase();
  const demandSignals = [
    "how do you handle",
    "is there a tool for",
    "too complicated",
    "i hate",
    "i am tired of",
    "i'm tired of",
    "any alternative to",
    "struggling with",
    "what do you use for",
    "pain point",
    "problem",
    "complaint",
    "looking for a tool",
    "recommend",
    "alternative",
    "annoying",
    "frustrating",
    "manual",
    "spreadsheet",
    "excel",
    "notion",
    "takes too much time",
    "waste time",
    "麻烦",
    "不好用",
    "太复杂",
    "太难",
    "求推荐",
    "有没有工具",
    "替代",
    "手动",
    "表格",
    "重复",
    "耗时",
    "痛点",
    "抱怨",
    "吐槽",
    "卡住"
  ];

  return demandSignals.some((signal) => lower.includes(signal.toLowerCase()));
}

function isWeakOrInvalidEvidencePage(text: string, title: string) {
  const lower = `${title} ${text}`.toLowerCase();
  const invalidSignals = [
    "press release",
    "sponsored",
    "advertisement",
    "affiliate",
    "buy now",
    "sign up today",
    "product hunt",
    "launch announcement",
    "tutorial",
    "step by step guide",
    "how to build",
    "新闻",
    "教程",
    "推广",
    "广告",
    "软文",
    "融资",
    "发布"
  ];

  return invalidSignals.some((signal) => lower.includes(signal.toLowerCase()));
}

export function containsLoose(text: string, snippet?: string) {
  if (!snippet) return false;

  const normalizedText = normalize(text);
  const normalizedSnippet = normalize(snippet);

  if (normalizedSnippet.length < 8) return true;
  if (normalizedText.includes(normalizedSnippet)) return true;

  const tokens = extractTokens(snippet).filter((token) => token.length >= 4);
  if (tokens.length === 0) return false;

  const hits = tokens.filter((token) => normalizedText.includes(normalize(token))).length;
  return hits / tokens.length >= 0.6;
}

function extractTokens(value: string) {
  return Array.from(new Set(value.match(/[A-Za-z0-9]+|[\u4e00-\u9fff]{2,}/g) ?? []));
}

function normalize(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
