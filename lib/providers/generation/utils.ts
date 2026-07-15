import { z, type ZodType } from "zod";
import { mapProviderHttpError, providerResponseInvalid } from "@/lib/providers/shared-errors";
import type { GenerationProviderName } from "@/lib/providers/generation/capabilities";

export function parseStructuredOutput<T>(provider: GenerationProviderName, output: unknown, schema: ZodType<T>): T {
  let value = output;
  if (typeof output === "string") {
    value = parseJsonObject(output, provider);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw providerResponseInvalid(provider, "GENERATION");
  return parsed.data;
}

function parseJsonObject(output: string, provider: GenerationProviderName): unknown {
  const direct = output.trim();
  const fenced = direct.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidates = [direct, fenced].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue to an exact object extraction below. The final schema check remains mandatory.
    }
  }

  const embedded = extractSingleJsonObject(direct);
  if (embedded) {
    try {
      return JSON.parse(embedded);
    } catch {
      // Fall through to the fail-closed provider error.
    }
  }

  throw providerResponseInvalid(provider, "GENERATION");
}

function extractSingleJsonObject(value: string) {
  const start = value.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") quoted = false;
      continue;
    }
    if (character === "\"") quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        const remaining = value.slice(index + 1).trim();
        return remaining && remaining.replace(/^```$/, "").trim() ? null : value.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function schemaToJsonSchema(schema: ZodType<unknown>) {
  return z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" });
}

export function safeSchemaName(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "realneed_output";
}

export function normalizeTemperature(value: number | undefined) {
  if (!Number.isFinite(value)) return 0.2;
  return Math.min(1, Math.max(0, value ?? 0.2));
}

export function normalizeMaxTokens(value: number | undefined) {
  if (!Number.isFinite(value)) return 3000;
  return Math.min(8000, Math.max(64, Math.floor(value ?? 3000)));
}

export async function requestGenerationJson(input: {
  provider: GenerationProviderName;
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
    throw mapProviderHttpError({ provider: input.provider, kind: "GENERATION", status: 503, credentialSource: input.credentialSource });
  }
  if (!response.ok) {
    const safeCode = await readSafeProviderCode(response);
    throw mapProviderHttpError({ provider: input.provider, kind: "GENERATION", status: response.status, credentialSource: input.credentialSource, responseCode: safeCode });
  }
  try {
    return { payload: await response.json(), requestId: response.headers.get("x-request-id") ?? response.headers.get("request-id") };
  } catch {
    throw providerResponseInvalid(input.provider, "GENERATION");
  }
}

export function repairPrompts(output: unknown, schemaName: string) {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);
  return {
    systemPrompt: "Return one valid JSON value only. Do not use Markdown fences, explanations, URLs, or fields outside the requested schema.",
    userPrompt: `Repair the following invalid ${safeSchemaName(schemaName)} response without changing its factual claims:\n${serialized.slice(0, 12000)}`
  };
}

async function readSafeProviderCode(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { code?: unknown; type?: unknown; status?: unknown }; code?: unknown };
    return String(payload.error?.code ?? payload.error?.type ?? payload.error?.status ?? payload.code ?? "").slice(0, 80);
  } catch {
    return null;
  }
}
