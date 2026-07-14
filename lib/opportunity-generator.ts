import { z } from "zod";
import { callKimiJson } from "@/lib/kimi";
import { generateOpportunitiesPrompt } from "@/lib/prompts";
import type { ApiUsageContext } from "@/lib/usage-tracker";
import type { EvidenceSource, InterpretedIdea, ProductOpportunity } from "@/lib/types";

const OpportunityResponseSchema = z.object({
  opportunities: z.array(
    z.object({
      id: z.string().min(1),
      productName: z.string().min(1),
      oneSentence: z.string().min(1),
      targetUser: z.string().min(1),
      painPoint: z.string().min(1),
      sourceEvidenceIds: z.array(z.string()).min(1),
      mvp: z.string().min(1),
      firstStep: z.string().min(1),
      monetization: z.string().min(1),
      chinaFit: z.string().min(1),
      difficulty: z.enum(["easy", "medium", "hard"]),
      evidenceScore: z.number().min(0).max(100),
      risks: z.array(z.string()),
      whyNotGeneric: z.string().min(1)
    })
  )
});

const forbiddenWords = ["蓝海", "暴富", "躺赚", "保证收益", "超级 App", "超级App", "一站式平台", "社区平台"];

export class OpportunityGenerationError extends Error {
  status = 502;

  constructor(message = "Kimi opportunity generation failed. No local fallback was used.") {
    super(message);
    this.name = "OpportunityGenerationError";
  }
}

export async function generateOpportunities({
  idea,
  interpretedIdea,
  evidence,
  usage
}: {
  idea: string;
  interpretedIdea: InterpretedIdea;
  evidence: EvidenceSource[];
  usage?: Omit<ApiUsageContext, "operation">;
}): Promise<{ opportunities: ProductOpportunity[]; usedKimi: boolean; warnings: string[] }> {
  const usableEvidence = evidence.filter((item) => item.relevanceScore >= 50);

  if (usableEvidence.length < 2) {
    return {
      opportunities: [],
      usedKimi: false,
      warnings: ["有效 evidence 少于 2 条，系统不会生成产品机会。"]
    };
  }

  try {
    const response = await callKimiJson({
      schema: OpportunityResponseSchema,
      system: "你是 Evidence-first AI Product Builder。只输出严格 JSON。没有足够 evidence 就返回空机会。不能编造 URL 或帖子。",
      user: generateOpportunitiesPrompt({ idea, interpretedIdea, evidence: usableEvidence }),
      temperature: 0.25,
      usage: usage ? { ...usage, operation: "opportunity_generation" } : undefined
    });

    const opportunities = sanitizeOpportunities(response.opportunities, usableEvidence);

    return {
      opportunities,
      usedKimi: true,
      warnings: opportunities.length ? [] : ["Kimi 生成的机会未通过证据绑定审查，已全部过滤。"]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kimi opportunity generation failed";
    throw new OpportunityGenerationError(message);
  }
}

export function sanitizeOpportunities(opportunities: ProductOpportunity[], evidence: EvidenceSource[]) {
  const evidenceIds = new Set(evidence.map((item) => item.id));

  return opportunities
    .map((opportunity, index) => ({
      ...opportunity,
      id: opportunity.id || `op${index + 1}`,
      evidenceScore: Math.round(Math.min(100, Math.max(0, opportunity.evidenceScore))),
      sourceEvidenceIds: opportunity.sourceEvidenceIds.filter((id) => evidenceIds.has(id)),
      risks: normalizeRisks(opportunity, evidenceIds)
    }))
    .filter((opportunity) => opportunity.sourceEvidenceIds.length > 0)
    .filter((opportunity) => !containsForbiddenWords(opportunity))
    .filter((opportunity) => opportunity.difficulty !== "hard")
    .slice(0, 3);
}

function normalizeRisks(opportunity: ProductOpportunity, evidenceIds: Set<string>) {
  const risks = [...opportunity.risks];

  if (opportunity.sourceEvidenceIds.filter((id) => evidenceIds.has(id)).length === 1) {
    risks.push("当前只关联到 1 条 evidence，需要继续补证。");
  }

  if (opportunity.difficulty === "medium") {
    risks.push("对新手略有复杂度，建议先做人工交付版。");
  }

  return Array.from(new Set(risks));
}

function containsForbiddenWords(opportunity: ProductOpportunity) {
  const text = JSON.stringify(opportunity);
  return forbiddenWords.some((word) => text.includes(word));
}
