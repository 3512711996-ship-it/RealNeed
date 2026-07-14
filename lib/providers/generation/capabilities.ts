export const generationProviderNames = ["MOONSHOT", "OPENAI", "ANTHROPIC", "GOOGLE_GEMINI", "DEEPSEEK", "QWEN"] as const;
export type GenerationProviderName = (typeof generationProviderNames)[number];

export type GenerationModelCapabilities = {
  structuredOutput: boolean;
  nativeJsonSchema: boolean;
  jsonMode: boolean;
  longContext: boolean;
  streaming: boolean;
  toolCalling: boolean;
  testedByRealNeed: boolean;
};

export const generationProviderLabels: Record<GenerationProviderName, string> = {
  MOONSHOT: "Moonshot / Kimi",
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  GOOGLE_GEMINI: "Google Gemini",
  DEEPSEEK: "DeepSeek",
  QWEN: "Qwen"
};
