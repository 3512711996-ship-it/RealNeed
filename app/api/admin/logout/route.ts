import { NextResponse } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  clearAdminSessionOptions,
  requireAdminMutation,
  revokeCurrentAdminSession
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    await requireAdminMutation(request);
    await revokeCurrentAdminSession();
  } catch {
    // Always clear local credentials; an invalid session is already unusable.
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName, "", clearAdminSessionOptions(true));
  response.cookies.set(adminCsrfCookieName, "", clearAdminSessionOptions(false));
  return response;
}
