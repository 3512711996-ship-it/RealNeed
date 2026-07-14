import { mapProviderHttpError, providerResponseInvalid } from "@/lib/providers/shared-errors";

export async function requestSearchJson(input: {
  provider: string;
  url: string;
  init: RequestInit;
  credentialSource?: "PLATFORM" | "USER_PROVIDED";
  fetchImpl?: typeof fetch;
}) {
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(input.url, input.init);
  } catch (error) {
    if (input.init.signal?.aborted) throw error;
    throw mapProviderHttpError({ provider: input.provider, kind: "SEARCH", status: 503, credentialSource: input.credentialSource });
  }
  if (!response.ok) {
    const safeCode = await readSafeProviderCode(response);
    throw mapProviderHttpError({
      provider: input.provider,
      kind: "SEARCH",
      status: response.status,
      credentialSource: input.credentialSource,
      responseCode: safeCode
    });
  }
  try {
    return await response.json();
  } catch {
    throw providerResponseInvalid(input.provider, "SEARCH");
  }
}

async function readSafeProviderCode(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { code?: unknown; type?: unknown }; code?: unknown };
    return String(payload.error?.code ?? payload.error?.type ?? payload.code ?? "").slice(0, 80);
  } catch {
    return null;
  }
}
