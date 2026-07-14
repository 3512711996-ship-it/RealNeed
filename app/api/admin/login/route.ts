import { NextResponse } from "next/server";
import {
  adminCookieOptions,
  adminCsrfCookieName,
  adminCsrfCookieOptions,
  adminSessionCookieName,
  assertTrustedOrigin,
  createAdminSession,
  verifyAdminPassword
} from "@/lib/admin-auth";
import { assertRateLimit, getClientIp, isRateLimitError, RateLimitError } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    await assertRateLimit({
      key: `admin-login:${getClientIp(request)}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
      message: "管理员登录尝试过于频繁。"
    });
    const payload = (await request.json().catch(() => ({}))) as { password?: string };

    if (!payload.password || !verifyAdminPassword(payload.password)) {
      return NextResponse.json({ ok: false, message: "管理员密码不正确。" }, { status: 401 });
    }

    const session = await createAdminSession();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(adminSessionCookieName, session.sessionToken, adminCookieOptions());
    response.cookies.set(adminCsrfCookieName, session.csrfToken, adminCsrfCookieOptions());
    return response;
  } catch (error) {
    const status = getStatus(error);
    const headers = error instanceof RateLimitError ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
    return NextResponse.json({ ok: false, message: status === 403 ? "请求来源不受信任。" : "登录暂时不可用。" }, { status, headers });
  }
}

function getStatus(error: unknown) {
  if (isRateLimitError(error)) return error.status;
  if (typeof error === "object" && error && "status" in error) return Number((error as { status: unknown }).status) || 500;
  return 500;
}
