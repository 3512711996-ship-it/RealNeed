import { NextResponse } from "next/server";
import { isCredentialEncryptionConfigured } from "@/lib/credential-encryption";
import { generationProviderLabels, generationProviderNames } from "@/lib/providers/generation/capabilities";
import { generationModelCatalog, modelsForProvider } from "@/lib/providers/generation/model-catalog";
import { getGenerationProviderAdapter } from "@/lib/providers/generation/registry";
import { searchProviderLabels, searchProviderNames } from "@/lib/providers/search/capabilities";
import { getSearchProviderAdapter } from "@/lib/providers/search/registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    byokEnabled: isCredentialEncryptionConfigured(),
    searchProviders: searchProviderNames.map((provider) => ({
      provider,
      displayName: searchProviderLabels[provider],
      implemented: true,
      enabled: true,
      connectionTestImplemented: true,
      contractTested: true,
      liveTestedByRealNeed: provider === "TAVILY",
      capabilities: getSearchProviderAdapter(provider).getCapabilities()
    })),
    generationProviders: generationProviderNames.map((provider) => ({
      provider,
      displayName: generationProviderLabels[provider],
      implemented: true,
      enabled: modelsForProvider(provider).length > 0,
      connectionTestImplemented: true,
      contractTested: true,
      liveTestedByRealNeed: provider === "MOONSHOT",
      models: generationModelCatalog.filter((model) => model.provider === provider).map((model) => ({
        modelId: model.modelId,
        displayName: model.displayName,
        enabled: model.enabled,
        capabilities: getGenerationProviderAdapter(provider).getCapabilities(model.modelId),
        maxContextTokens: model.maxContextTokens,
        maxOutputTokens: model.maxOutputTokens,
        notes: model.notes
      }))
    }))
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
