import { z } from "zod";
import { generationProviderNames } from "@/lib/providers/generation/capabilities";
import { searchProviderNames } from "@/lib/providers/search/capabilities";

export const searchExecutionConfigSchema = z.object({
  credentialSource: z.enum(["PLATFORM", "USER_PROVIDED"]),
  provider: z.enum(searchProviderNames),
  credentialId: z.string().nullable(),
  configurationVersion: z.number().int().min(1)
}).strict();

export const generationExecutionConfigSchema = z.object({
  credentialSource: z.enum(["PLATFORM", "USER_PROVIDED"]),
  provider: z.enum(generationProviderNames),
  model: z.string().min(1).max(120),
  credentialId: z.string().nullable(),
  configurationVersion: z.number().int().min(1)
}).strict();

export type SearchExecutionConfig = z.infer<typeof searchExecutionConfigSchema>;
export type GenerationExecutionConfig = z.infer<typeof generationExecutionConfigSchema>;

export const defaultSearchExecutionConfig: SearchExecutionConfig = { credentialSource: "PLATFORM", provider: "TAVILY", credentialId: null, configurationVersion: 1 };
export const defaultGenerationExecutionConfig: GenerationExecutionConfig = { credentialSource: "PLATFORM", provider: "MOONSHOT", model: "kimi-k2.5", credentialId: null, configurationVersion: 1 };

export function parseSearchExecutionConfig(value: unknown) {
  return searchExecutionConfigSchema.safeParse(value).data ?? defaultSearchExecutionConfig;
}

export function parseGenerationExecutionConfig(value: unknown) {
  return generationExecutionConfigSchema.safeParse(value).data ?? defaultGenerationExecutionConfig;
}
