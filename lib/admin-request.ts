import { NextResponse } from "next/server";
import { requireAdminMutation } from "@/lib/admin-auth";
import {
  assertRateLimit,
  getClientIp,
  isRateLimitError,
  RateLimitError
} from "@/lib/rate-limit";

export async function protectAdminMutation(
  request: Request,
  action: string,
  options: { limit?: number; windowMs?: number } = {}
) {
  await assertRateLimit({
    key: `admin-${action}:${getClientIp(request)}`,
    limit: options.limit ?? 30,
    windowMs: options.windowMs ?? 60 * 60 * 1000,
    message: "管理员操作过于频繁。"
  });
  return requireAdminMutation(request);
}

export function adminSecurityErrorResponse(error: unknown, fallbackMessage: string) {
  const status = getAdminErrorStatus(error);
  const headers = error instanceof RateLimitError ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
  return NextResponse.json(
    { message: status === 401 ? "未登录。" : status === 403 ? "安全校验失败，请刷新后台并重新登录。" : fallbackMessage },
    { status, headers }
  );
}

export function getAdminErrorStatus(error: unknown) {
  if (isRateLimitError(error)) return error.status;
  if (typeof error === "object" && error && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  return 500;
}
