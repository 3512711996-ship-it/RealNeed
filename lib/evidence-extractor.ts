import { z } from "zod";
import { callKimiJson } from "@/lib/kimi";
import { extractEvidencePrompt } from "@/lib/prompts";
import { ProviderExecutionError } from "@/lib/providers/shared-errors";
import type { ApiUsageContext } from "@/lib/usage-tracker";
import type { EvidenceSource, InterpretedIdea, SearchResult } from "@/lib/types";

const EvidenceResponseSchema = z.object({
  evidence: z.array(
    z.object({
      id: z.string().min(1).optional(),
      title: z.string().min(1).optional(),
      url: z.string().nullable().optional(),
      platform: z.string().min(1).optional(),
      subreddit: z.string().optional(),
      sourceText: z.string().min(1),
      painPoint: z.string().min(1),
      targetUser: z.string().min(1),
      existingAlternative: z.string().optional(),
      userQuoteOrSummary: z.string().optional(),
      whyThisIsDemand: z.string().optional(),
      evidenceStrength: z.enum(["weak", "medium", "strong"]),
      relevanceScore: z.number().min(0).max(100)
    })
  )
});

export class EvidenceExtractionError extends Error {
  status = 502;

  constructor(message = "Kimi evidence extraction failed. No local fallback was used.") {
    super(message);
    this.name = "EvidenceExtractionError";
  }
}

export async function extractEvidence({
  idea,
  interpretedIdea,
  searchResults,
  usage
}: {
  idea: string;
  interpretedIdea: InterpretedIdea;
  searchResults: SearchResult[];
  usage?: Omit<ApiUsageContext, "operation">;
}): Promise<{ evidence: EvidenceSource[]; usedKimi: boolean; warnings: string[] }> {
  try {
    const response = await callKimiJson({
      schema: EvidenceResponseSchema,
      system: "你是需求证据抽取器。只输出严格 JSON。你只能引用系统提供的 verified sources，绝对不能编造 URL 或 Reddit 帖子。",
      user: extractEvidencePrompt({ idea, interpretedIdea, searchResults }),
      temperature: 0.1,
      usage: usage ? { ...usage, operation: "evidence_extraction" } : undefined
    });

    const evidence = sanitizeEvidence(response.evidence, searchResults);

    return {
      evidence,
      usedKimi: true,
      warnings: evidence.length ? [] : ["没有从 verified sources 中抽取到足够明确的真实需求证据。"]
    };
  } catch (error) {
    if (error instanceof ProviderExecutionError) throw error;
    const message = error instanceof Error ? error.message : "Kimi evidence extraction failed";
    throw new EvidenceExtractionError(message);
  }
}

function sanitizeEvidence(
  evidence: z.infer<typeof EvidenceResponseSchema>["evidence"],
  searchResults: SearchResult[]
): EvidenceSource[] {
  const manualSource = searchResults.find((result) => result.platform === "user_paste" || result.platform === "manual_paste" || !result.url);
  const resultsByUrl = new Map(
    searchResults
      .filter((result) => result.url)
      .map((result) => [normalizeUrlForCompare(result.url as string), result])
  );

  return evidence
    .map((item, index): EvidenceSource | null => {
      const url = typeof item.url === "string" && item.url.trim() ? item.url.trim() : undefined;
      const matchedSource = url ? resultsByUrl.get(normalizeUrlForCompare(url)) : manualSource;

      if (!matchedSource) return null;

      const rawContent = matchedSource.rawContent ?? matchedSource.snippet;
      if (!sourceTextExists(item.sourceText, rawContent)) return null;

      const isManual = matchedSource.platform === "user_paste" || matchedSource.platform === "manual_paste" || !matchedSource.url;

      return {
        id: item.id || `e${index + 1}`,
        title: matchedSource.title,
        url: isManual ? undefined : matchedSource.url,
        platform: isManual ? "用户粘贴内容" : matchedSource.platform,
        subreddit: matchedSource.subreddit ?? item.subreddit ?? inferSubreddit(matchedSource.url, matchedSource.title),
        sourceText: item.sourceText,
        painPoint: item.painPoint,
        targetUser: item.targetUser,
        existingAlternative: item.existingAlternative,
        userQuoteOrSummary: item.userQuoteOrSummary ?? item.sourceText,
        whyThisIsDemand: item.whyThisIsDemand,
        evidenceStrength: isManual && item.evidenceStrength === "strong" ? "medium" : item.evidenceStrength,
        relevanceScore: Math.round(clamp(item.relevanceScore, 0, 100)),
        sourceVerification: {
          isExternalVerified: !isManual
        }
      };
    })
    .filter((item): item is EvidenceSource => Boolean(item))
    .slice(0, 10);
}

function sourceTextExists(sourceText: string, rawText: string) {
  const source = normalize(sourceText);
  const raw = normalize(rawText);

  if (source.length < 8) return true;
  if (raw.includes(source)) return true;

  const tokens = Array.from(new Set(sourceText.match(/[A-Za-z0-9]+|[\u4e00-\u9fff]{2,}/g) ?? [])).filter(
    (token) => token.length >= 4
  );

  if (tokens.length === 0) return false;

  const hits = tokens.filter((token) => raw.includes(normalize(token))).length;
  return hits / tokens.length >= 0.65;
}

function normalize(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
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

function inferSubreddit(url: string | undefined, title: string) {
  const fromUrl = url?.match(/reddit\.com\/r\/([^/]+)/i)?.[1];
  if (fromUrl) return `r/${fromUrl}`;

  const fromTitle = title.match(/\br\/[A-Za-z0-9_]+/);
  return fromTitle?.[0];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
