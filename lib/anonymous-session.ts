import { cookies } from "next/headers";
import { generateOpaqueToken, hashToken, tokenMatches } from "@/lib/crypto-tokens";
import { prisma } from "@/lib/prisma";

export const anonymousSessionCookie = "rn_anon_session";
export const anonymousCsrfCookie = "rn_anon_csrf";
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;

export type AnonymousSessionContext = {
  ownerSessionHash: string;
  csrfToken: string;
};

export async function ensureAnonymousSession(): Promise<AnonymousSessionContext> {
  const store = await cookies();
  const sessionToken = store.get(anonymousSessionCookie)?.value;
  const csrfToken = store.get(anonymousCsrfCookie)?.value;
  const existing = sessionToken
    ? await prisma.anonymousSession.findUnique({ where: { tokenHash: hashToken(sessionToken) } })
    : null;
  const now = new Date();

  if (existing && !existing.revokedAt && existing.expiresAt > now) {
    let activeCsrf = csrfToken;
    if (!activeCsrf || !tokenMatches(activeCsrf, existing.csrfTokenHash)) {
      activeCsrf = generateOpaqueToken("rn_csrf");
      await prisma.anonymousSession.update({ where: { id: existing.id }, data: { csrfTokenHash: hashToken(activeCsrf), lastUsedAt: now } });
      setCsrfCookie(store, activeCsrf, existing.expiresAt);
    } else {
      await prisma.anonymousSession.update({ where: { id: existing.id }, data: { lastUsedAt: now } });
    }
    return { ownerSessionHash: existing.tokenHash, csrfToken: activeCsrf };
  }

  const nextSessionToken = generateOpaqueToken("rn_session");
  const nextCsrfToken = generateOpaqueToken("rn_csrf");
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  const tokenHash = hashToken(nextSessionToken);
  await prisma.anonymousSession.create({
    data: { tokenHash, csrfTokenHash: hashToken(nextCsrfToken), expiresAt, lastUsedAt: now }
  });
  const secure = process.env.NODE_ENV === "production";
  store.set(anonymousSessionCookie, nextSessionToken, { httpOnly: true, secure, sameSite: "strict", path: "/", expires: expiresAt });
  setCsrfCookie(store, nextCsrfToken, expiresAt);
  return { ownerSessionHash: tokenHash, csrfToken: nextCsrfToken };
}

export async function requireAnonymousSession(request: Request, options: { requireCsrf?: boolean } = {}) {
  const store = await cookies();
  const sessionToken = store.get(anonymousSessionCookie)?.value;
  if (!sessionToken) throw authError();
  const ownerSessionHash = hashToken(sessionToken);
  const session = await prisma.anonymousSession.findUnique({ where: { tokenHash: ownerSessionHash } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) throw authError();
  if (options.requireCsrf) {
    const csrf = request.headers.get("x-csrf-token") ?? "";
    if (!csrf || !tokenMatches(csrf, session.csrfTokenHash)) {
      throw Object.assign(new Error("安全校验失败，请刷新页面后重试。"), { status: 403, code: "CSRF_FAILED" });
    }
  }
  return { ownerSessionHash, sessionId: session.id };
}

function setCsrfCookie(store: Awaited<ReturnType<typeof cookies>>, token: string, expiresAt: Date) {
  store.set(anonymousCsrfCookie, token, { httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: expiresAt });
}

function authError() {
  return Object.assign(new Error("匿名会话已失效，请刷新页面后重试。"), { status: 401, code: "ANONYMOUS_SESSION_REQUIRED" });
}
