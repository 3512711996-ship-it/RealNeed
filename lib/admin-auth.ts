import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { generateOpaqueToken, hashToken, tokenMatches } from "@/lib/crypto-tokens";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const adminSessionCookieName = "realneed_admin_session";
export const adminCsrfCookieName = "realneed_admin_csrf";

const sessionMaxAgeSeconds = 60 * 60 * 8;

export class AdminAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

export function verifyAdminPassword(password: string) {
  const expected = getServerEnv().adminPassword;
  if (!expected) return false;
  return safeEqual(password, expected);
}

export async function createAdminSession() {
  const sessionToken = generateOpaqueToken("rn_admin");
  const csrfToken = generateOpaqueToken("rn_csrf");
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000);
  await prisma.adminSession.create({
    data: {
      tokenHash: hashToken(sessionToken),
      csrfTokenHash: hashToken(csrfToken),
      expiresAt
    }
  });
  await prisma.adminSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
      ]
    }
  });
  return { sessionToken, csrfToken, expiresAt };
}

export async function getAdminSession() {
  const store = await cookies();
  const token = store.get(adminSessionCookieName)?.value;
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, csrfTokenHash: true, expiresAt: true, revokedAt: true, lastUsedAt: true }
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.lastUsedAt || Date.now() - session.lastUsedAt.getTime() > 5 * 60 * 1000) {
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() }
    });
  }
  return session;
}

export async function requireAdminMutation(request: Request) {
  assertTrustedOrigin(request);
  const session = await getAdminSession();
  if (!session) throw new AdminAuthError("未登录。");
  const store = await cookies();
  const csrfCookie = store.get(adminCsrfCookieName)?.value;
  const csrfHeader = request.headers.get("x-realneed-csrf");
  if (!csrfCookie || !csrfHeader || !safeEqual(csrfCookie, csrfHeader) || !tokenMatches(csrfHeader, session.csrfTokenHash)) {
    throw new AdminAuthError("安全校验失败，请刷新后台并重新登录。", 403);
  }
  return session;
}

export async function revokeCurrentAdminSession() {
  const store = await cookies();
  const token = store.get(adminSessionCookieName)?.value;
  if (!token) return;
  await prisma.adminSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export function assertTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new AdminAuthError("缺少同源安全信息。", 403);
  const configuredOrigin = getServerEnv().publicAppUrl;
  const expectedOrigin = new URL(configuredOrigin ?? request.url).origin;
  if (origin !== expectedOrigin) throw new AdminAuthError("请求来源不受信任。", 403);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds
  };
}

export function adminCsrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds
  };
}

export function clearAdminSessionOptions(httpOnly = true) {
  return {
    httpOnly,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  };
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
