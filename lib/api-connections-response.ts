import { NextResponse } from "next/server";
import { ProviderExecutionError } from "@/lib/providers/shared-errors";
import { RateLimitError, RateLimitUnavailableError } from "@/lib/rate-limit";
import { logServerError } from "@/lib/safe-logger";

export function apiConnectionsErrorResponse(error: unknown, fallback = "API 连接操作失败，请稍后重试。") {
  if (error instanceof ProviderExecutionError) {
    return NextResponse.json(
      { status: "error", code: error.code, provider: error.provider, kind: error.kind, message: error.safeMessage, retryable: error.retryable, actionRequired: error.actionRequired },
      { status: error.status, headers: { "Cache-Control": "no-store" } }
    );
  }
  const status = error instanceof RateLimitError || error instanceof RateLimitUnavailableError
    ? error.status
    : typeof error === "object" && error && "status" in error
      ? Number((error as { status?: unknown }).status) || 500
      : 500;
  const safeMessage = status >= 500 ? fallback : error instanceof Error ? error.message.slice(0, 240) : fallback;
  if (status >= 500) logServerError("api_connections_failed", error);
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (error instanceof RateLimitError) headers["Retry-After"] = String(error.retryAfterSeconds);
  return NextResponse.json({ status: "error", message: safeMessage }, { status, headers });
}
