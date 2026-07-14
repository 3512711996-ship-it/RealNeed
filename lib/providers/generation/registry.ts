import { AnthropicGenerationAdapter } from "@/lib/providers/generation/anthropic-adapter";
import { DeepSeekGenerationAdapter } from "@/lib/providers/generation/deepseek-adapter";
import { GeminiGenerationAdapter } from "@/lib/providers/generation/gemini-adapter";
import { MoonshotGenerationAdapter } from "@/lib/providers/generation/moonshot-adapter";
import { OpenAIGenerationAdapter } from "@/lib/providers/generation/openai-adapter";
import { QwenGenerationAdapter } from "@/lib/providers/generation/qwen-adapter";
import { generationProviderNames, type GenerationProviderName } from "@/lib/providers/generation/capabilities";
import type { GenerationProviderAdapter } from "@/lib/providers/generation/types";

export function getGenerationProviderAdapter(provider: GenerationProviderName, options: { moonshotEndpoint?: string } = {}): GenerationProviderAdapter {
  if (provider === "MOONSHOT") return new MoonshotGenerationAdapter(fetch, options.moonshotEndpoint);
  if (provider === "OPENAI") return new OpenAIGenerationAdapter();
  if (provider === "ANTHROPIC") return new AnthropicGenerationAdapter();
  if (provider === "GOOGLE_GEMINI") return new GeminiGenerationAdapter();
  if (provider === "DEEPSEEK") return new DeepSeekGenerationAdapter();
  if (provider === "QWEN") return new QwenGenerationAdapter();
  return assertNever(provider);
}

export function isGenerationProviderName(value: unknown): value is GenerationProviderName {
  return typeof value === "string" && generationProviderNames.includes(value as GenerationProviderName);
}

function assertNever(value: never): never { throw new Error(`Unsupported generation provider: ${String(value)}`); }
