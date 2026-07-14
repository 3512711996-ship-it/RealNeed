import { z } from "zod";
import { generationProviderNames } from "@/lib/providers/generation/capabilities";
import { getSupportedModel } from "@/lib/providers/generation/model-catalog";
import { searchProviderNames } from "@/lib/providers/search/capabilities";

const apiKeySchema = z.string().trim().min(8, "API Key 太短。请检查后重试。").max(512, "API Key 超过安全长度限制。");

export const connectionInputSchema = z.object({
  kind: z.enum(["SEARCH", "GENERATION"]),
  provider: z.string().trim().max(40),
  apiKey: apiKeySchema,
  model: z.string().trim().max(120).nullish()
}).strict().superRefine((value, context) => {
  if ("baseUrl" in value || "endpoint" in value || "headers" in value) {
    context.addIssue({ code: "custom", message: "不支持自定义 Base URL、Endpoint 或请求 Header。" });
  }
  if (value.kind === "SEARCH" && !searchProviderNames.includes(value.provider as (typeof searchProviderNames)[number])) {
    context.addIssue({ code: "custom", message: "不支持这个搜索供应商。", path: ["provider"] });
  }
  if (value.kind === "GENERATION") {
    if (!generationProviderNames.includes(value.provider as (typeof generationProviderNames)[number])) {
      context.addIssue({ code: "custom", message: "不支持这个生成模型供应商。", path: ["provider"] });
    } else if (!value.model || !getSupportedModel(value.provider as (typeof generationProviderNames)[number], value.model)) {
      context.addIssue({ code: "custom", message: "这个模型尚未通过 RealNeed 结构化输出要求。", path: ["model"] });
    }
  }
});

export const saveConnectionInputSchema = connectionInputSchema.and(z.object({ testProof: z.string().min(20).max(500) }).strict());

export const executionSelectionSchema = z.object({
  search: z.object({
    credentialSource: z.enum(["PLATFORM", "USER_PROVIDED"]),
    provider: z.enum(searchProviderNames),
    credentialId: z.string().cuid().nullable(),
    configurationVersion: z.number().int().min(1).max(100000).default(1)
  }).strict(),
  generation: z.object({
    credentialSource: z.enum(["PLATFORM", "USER_PROVIDED"]),
    provider: z.enum(generationProviderNames),
    model: z.string().min(1).max(120),
    credentialId: z.string().cuid().nullable(),
    configurationVersion: z.number().int().min(1).max(100000).default(1)
  }).strict()
}).strict();

export type ExecutionSelection = z.infer<typeof executionSelectionSchema>;
