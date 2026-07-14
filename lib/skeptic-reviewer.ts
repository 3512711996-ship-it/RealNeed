import { z } from "zod";
import { callKimiJson } from "@/lib/kimi";
import { sanitizeOpportunities } from "@/lib/opportunity-generator";
import { skepticReviewPrompt } from "@/lib/prompts";
import { ProviderExecutionError } from "@/lib/providers/shared-errors";
import type { EvidenceSource, ProductOpportunity } from "@/lib/types";

const SkepticReviewSchema = z.object({
  opportunities: z.array(
    z.object({
      id: z.string(),
      productName: z.string(),
      oneSentence: z.string(),
      targetUser: z.string(),
      painPoint: z.string(),
      sourceEvidenceIds: z.array(z.string()),
      mvp: z.string(),
      firstStep: z.string(),
      monetization: z.string(),
      chinaFit: z.string(),
      difficulty: z.enum(["easy", "medium", "hard"]),
      evidenceScore: z.number(),
      risks: z.array(z.string()),
      whyNotGeneric: z.string()
    })
  ),
  warnings: z.array(z.string())
});

export class SkepticReviewError extends Error {
  status = 502;

  constructor(message = "Kimi skeptic review failed. No local fallback was used.") {
    super(message);
    this.name = "SkepticReviewError";
  }
}

export async function skepticReview({
  opportunities,
  evidence
}: {
  opportunities: ProductOpportunity[];
  evidence: EvidenceSource[];
}): Promise<{ opportunities: ProductOpportunity[]; usedKimi: boolean; warnings: string[] }> {
  if (opportunities.length === 0) {
    return { opportunities, usedKimi: false, warnings: [] };
  }

  try {
    const response = await callKimiJson({
      schema: SkepticReviewSchema,
      system: "你是冷静的产品机会审查员。只输出严格 JSON。不能补写来源，不能补写机会。",
      user: skepticReviewPrompt({ opportunities, evidence }),
      temperature: 0.1
    });

    return {
      opportunities: sanitizeOpportunities(response.opportunities, evidence),
      usedKimi: true,
      warnings: response.warnings
    };
  } catch (error) {
    if (error instanceof ProviderExecutionError) throw error;
    const message = error instanceof Error ? error.message : "Kimi skeptic review failed";
    throw new SkepticReviewError(message);
  }
}
