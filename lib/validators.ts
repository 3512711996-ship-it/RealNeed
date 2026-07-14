import { z } from "zod";
import type { AnalyzeRequest } from "@/lib/types";

export class InputValidationError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

const RawAnalyzeRequestSchema = z.object({
  idea: z.string().trim().max(500, "想法太长了，请先压缩到 500 字以内。"),
  mode: z.enum(["auto_search", "manual_paste"]).default("auto_search"),
  pastedContent: z.string().max(12000, "粘贴内容太长了，请先截取最有代表性的评论或帖子。").optional(),
  clarificationAnswers: z
    .object({
      targetUser: z.string().trim().max(160).optional(),
      painfulScene: z.string().trim().max(260).optional(),
      productForm: z.string().trim().max(120).optional()
    })
    .optional(),
  market: z.literal("china").default("china"),
  userLevel: z.literal("vibe_coding_beginner").default("vibe_coding_beginner")
});

export function validateInput(payload: unknown): AnalyzeRequest {
  const parsed = RawAnalyzeRequestSchema.safeParse(payload);

  if (!parsed.success) {
    throw new InputValidationError(parsed.error.issues[0]?.message ?? "输入格式不正确。");
  }

  const data = parsed.data;
  const idea = data.idea.trim();
  const pastedContent = data.pastedContent?.trim();

  if (!idea) {
    throw new InputValidationError("请先输入一个产品想法。");
  }

  if (idea.length < 5) {
    throw new InputValidationError("这个想法太短了，请再说清楚一点，至少 5 个字。");
  }

  if (data.mode === "manual_paste" && (!pastedContent || pastedContent.length < 100)) {
    throw new InputValidationError("手动粘贴模式下，请至少粘贴 100 字真实帖子、评论或用户反馈。");
  }

  return {
    idea,
    mode: data.mode,
    pastedContent,
    clarificationAnswers: data.clarificationAnswers,
    market: data.market,
    userLevel: data.userLevel
  };
}
