import { z } from "zod";
import { callKimiJson } from "@/lib/kimi";
import { interpretIdeaPrompt } from "@/lib/prompts";
import type { ApiUsageContext } from "@/lib/usage-tracker";
import type { InterpretedIdea } from "@/lib/types";

const InterpretedIdeaSchema = z.object({
  domain: z.string().min(1),
  targetUsers: z.array(z.string()).min(1).max(6),
  possiblePainPoints: z.array(z.string()).min(1).max(8),
  keywordsZh: z.array(z.string()).min(1).max(12),
  keywordsEn: z.array(z.string()).min(1).max(12),
  assumptions: z.array(z.string()).max(8)
});

export class IdeaInterpretationError extends Error {
  status = 502;

  constructor(message = "Kimi idea interpretation failed. No local fallback was used.") {
    super(message);
    this.name = "IdeaInterpretationError";
  }
}

export async function interpretIdea(idea: string, usage?: Omit<ApiUsageContext, "operation">): Promise<{
  interpretedIdea: InterpretedIdea;
  usedKimi: boolean;
  warnings: string[];
}> {
  try {
    const interpretedIdea = await callKimiJson({
      schema: InterpretedIdeaSchema,
      system: "你是只做需求证据分析的产品研究员。请输出严格 JSON，不要编造来源。",
      user: interpretIdeaPrompt(idea),
      usage: usage ? { ...usage, operation: "idea_interpretation" } : undefined
    });

    return { interpretedIdea, usedKimi: true, warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kimi idea interpretation failed";
    throw new IdeaInterpretationError(message);
  }
}
