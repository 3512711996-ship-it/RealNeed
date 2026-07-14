import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieState.get(name);
      return value ? { name, value } : undefined;
    }
  })
}));

import {
  adminCsrfCookieName,
  adminSessionCookieName,
  createAdminSession,
  getAdminSession,
  requireAdminMutation,
  revokeCurrentAdminSession
} from "../lib/admin-auth";
import { hashToken } from "../lib/crypto-tokens";
import { prisma } from "../lib/prisma";

const sessionIds: string[] = [];
const originalPublicAppUrl = process.env.PUBLIC_APP_URL;

beforeEach(() => {
  cookieState.clear();
  process.env.PUBLIC_APP_URL = "http://localhost:3000";
});

afterEach(async () => {
  cookieState.clear();
  process.env.PUBLIC_APP_URL = originalPublicAppUrl;
  if (sessionIds.length) await prisma.adminSession.deleteMany({ where: { id: { in: sessionIds.splice(0) } } });
});

describe("admin session and CSRF", () => {
  it("requires the matching CSRF cookie and header", async () => {
    const session = await createAdminSession();
    const record = await prisma.adminSession.findUniqueOrThrow({ where: { tokenHash: hashToken(session.sessionToken) } });
    sessionIds.push(record.id);
    cookieState.set(adminSessionCookieName, session.sessionToken);
    cookieState.set(adminCsrfCookieName, session.csrfToken);

    await expect(
      requireAdminMutation(
        new Request("http://localhost:3000/api/admin/orders/test/notes", {
          method: "PATCH",
          headers: { Origin: "http://localhost:3000" }
        })
      )
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      requireAdminMutation(
        new Request("http://localhost:3000/api/admin/orders/test/notes", {
          method: "PATCH",
          headers: {
            Origin: "http://localhost:3000",
            "X-RealNeed-CSRF": session.csrfToken
          }
        })
      )
    ).resolves.toMatchObject({ id: record.id });
  });

  it("revokes the database session on logout", async () => {
    const session = await createAdminSession();
    const record = await prisma.adminSession.findUniqueOrThrow({ where: { tokenHash: hashToken(session.sessionToken) } });
    sessionIds.push(record.id);
    cookieState.set(adminSessionCookieName, session.sessionToken);

    expect(await getAdminSession()).toMatchObject({ id: record.id });
    await revokeCurrentAdminSession();
    expect(await getAdminSession()).toBeNull();
  });
});
