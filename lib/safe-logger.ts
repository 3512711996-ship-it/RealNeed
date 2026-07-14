import { randomUUID } from "node:crypto";

const secretTokenPatterns = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\btvly-[A-Za-z0-9_-]{12,}\b/g,
  /\brn_(?:report|recovery|admin|csrf)_[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:postgres(?:ql)?|redis(?:s)?):\/\/[^\s"']+/gi
];

export function redactSensitiveText(value: string) {
  let output = value;
  for (const secret of configuredSecrets()) {
    output = output.split(secret).join("[REDACTED]");
  }
  for (const pattern of secretTokenPatterns) {
    output = output.replace(pattern, "[REDACTED]");
  }
  return output.slice(0, 500);
}

export function logServerError(event: string, error: unknown, context: Record<string, string | number | boolean | null> = {}) {
  const errorId = randomUUID();
  console.error("[RealNeed error]", {
    event: safeEventName(event),
    errorId,
    errorName: error instanceof Error ? safeEventName(error.name) : "UnknownError",
    errorCode: getErrorCode(error),
    context: sanitizeContext(context)
  });
  return errorId;
}

export function logSecurityEvent(event: string, context: Record<string, string | number | boolean | null> = {}) {
  console.error("[RealNeed security]", {
    event: safeEventName(event),
    eventId: randomUUID(),
    context: sanitizeContext(context)
  });
}

function configuredSecrets() {
  return [
    process.env.TAVILY_API_KEY,
    process.env.MOONSHOT_API_KEY,
    process.env.DATABASE_URL,
    process.env.REDIS_URL,
    process.env.ADMIN_PASSWORD,
    process.env.OWNER_WECHAT_ID,
    process.env.API_CREDENTIAL_ENCRYPTION_KEY,
    process.env.BRAVE_API_KEY,
    process.env.EXA_API_KEY,
    process.env.PERPLEXITY_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.DEEPSEEK_API_KEY,
    process.env.QWEN_API_KEY
  ].filter((value): value is string => Boolean(value && value.length >= 4));
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error) {
    const raw = "code" in error ? (error as { code?: unknown }).code : undefined;
    if (typeof raw === "string") return safeEventName(raw);
    const status = "status" in error ? Number((error as { status?: unknown }).status) : NaN;
    if (Number.isInteger(status)) return `HTTP_${status}`;
  }
  return "UNCLASSIFIED";
}

function sanitizeContext(context: Record<string, string | number | boolean | null>) {
  return Object.fromEntries(
    Object.entries(context)
      .slice(0, 16)
      .map(([key, value]) => [safeEventName(key), typeof value === "string" ? redactSensitiveText(value).slice(0, 120) : value])
  );
}

function safeEventName(value: string) {
  return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100) || "unknown";
}
