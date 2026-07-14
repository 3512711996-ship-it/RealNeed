import type { ApiCredentialKind } from "@prisma/client";
import { getGenerationProviderAdapter } from "@/lib/providers/generation/registry";
import type { GenerationProviderName } from "@/lib/providers/generation/capabilities";
import { getSearchProviderAdapter } from "@/lib/providers/search/registry";
import type { SearchProviderName } from "@/lib/providers/search/capabilities";

export async function testProviderConnection(input: {
  kind: ApiCredentialKind;
  provider: string;
  apiKey: string;
  model?: string | null;
  signal?: AbortSignal;
}) {
  if (input.kind === "SEARCH") {
    return getSearchProviderAdapter(input.provider as SearchProviderName).testConnection({ apiKey: input.apiKey, signal: input.signal });
  }
  return getGenerationProviderAdapter(input.provider as GenerationProviderName).testConnection({ apiKey: input.apiKey, model: input.model ?? "", signal: input.signal });
}
