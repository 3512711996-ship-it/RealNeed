import type { GenerationModelCapabilities, GenerationProviderName } from "@/lib/providers/generation/capabilities";

export type SupportedGenerationModel = { provider: GenerationProviderName; modelId: string; displayName: string; enabled: boolean; capabilities: GenerationModelCapabilities; maxContextTokens: number | null; maxOutputTokens: number | null; notes: string | null; };
const jsonMode = (testedByRealNeed: boolean): GenerationModelCapabilities => ({ structuredOutput: true, nativeJsonSchema: false, jsonMode: true, longContext: true, streaming: false, toolCalling: false, testedByRealNeed });
const nativeSchema = (testedByRealNeed: boolean): GenerationModelCapabilities => ({ structuredOutput: true, nativeJsonSchema: true, jsonMode: true, longContext: true, streaming: false, toolCalling: true, testedByRealNeed });

export const generationModelCatalog: SupportedGenerationModel[] = [
  { provider: "MOONSHOT", modelId: "kimi-k2.5", displayName: "Kimi K2.5", enabled: true, capabilities: jsonMode(false), maxContextTokens: null, maxOutputTokens: null, notes: "用户自带 Key 模式；保存前必须通过 Moonshot 的真实连接测试。" },
  { provider: "MOONSHOT", modelId: "moonshot-v1-8k", displayName: "Moonshot v1 8K", enabled: true, capabilities: jsonMode(true), maxContextTokens: 8192, maxOutputTokens: 4096, notes: "平台模式已有真实调用记录；BYOK 仍需用户 Key 自测。" },
  { provider: "MOONSHOT", modelId: "kimi-k2-0711-preview", displayName: "Kimi K2", enabled: true, capabilities: jsonMode(false), maxContextTokens: 131072, maxOutputTokens: 8192, notes: "Adapter contract 已实现，未使用本机用户 Key live test。" },
  { provider: "OPENAI", modelId: "gpt-4.1-mini", displayName: "GPT-4.1 mini", enabled: true, capabilities: nativeSchema(false), maxContextTokens: 1047576, maxOutputTokens: 32768, notes: "Adapter contract 已实现，未完成真实 live test。" },
  { provider: "ANTHROPIC", modelId: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4", enabled: true, capabilities: nativeSchema(false), maxContextTokens: 200000, maxOutputTokens: 16000, notes: "通过强制工具输入实现结构化输出，未完成真实 live test。" },
  { provider: "GOOGLE_GEMINI", modelId: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", enabled: true, capabilities: nativeSchema(false), maxContextTokens: 1048576, maxOutputTokens: 65536, notes: "Adapter contract 已实现，未完成真实 live test。" },
  { provider: "DEEPSEEK", modelId: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash (recommended)", enabled: true, capabilities: jsonMode(false), maxContextTokens: 1_000_000, maxOutputTokens: 8192, notes: "DeepSeek 官方当前模型；RealNeed 使用官方 Chat Completions JSON Output 接口。" },
  { provider: "DEEPSEEK", modelId: "deepseek-v4-pro", displayName: "DeepSeek V4 Pro", enabled: true, capabilities: jsonMode(false), maxContextTokens: 1_000_000, maxOutputTokens: 8192, notes: "DeepSeek 官方当前模型；适合需要更高推理质量的报告。" },
  { provider: "DEEPSEEK", modelId: "deepseek-chat", displayName: "DeepSeek Chat (legacy compatibility)", enabled: true, capabilities: jsonMode(false), maxContextTokens: 128000, maxOutputTokens: 8192, notes: "旧别名仅用于已有连接兼容；新连接请使用 DeepSeek V4 Flash。" },
  { provider: "QWEN", modelId: "qwen-plus", displayName: "Qwen Plus", enabled: true, capabilities: jsonMode(false), maxContextTokens: 131072, maxOutputTokens: 8192, notes: "独立 DashScope Adapter，未完成真实 live test。" }
];

export function getSupportedModel(provider: GenerationProviderName, modelId: string) { return generationModelCatalog.find((model) => model.provider === provider && model.modelId === modelId && model.enabled) ?? null; }
export function modelsForProvider(provider: GenerationProviderName) { return generationModelCatalog.filter((model) => model.provider === provider && model.enabled); }
