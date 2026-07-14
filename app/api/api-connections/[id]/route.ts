import { NextResponse } from "next/server";
import { requireAnonymousSession } from "@/lib/anonymous-session";
import { apiConnectionsErrorResponse } from "@/lib/api-connections-response";
import { revokeCredential } from "@/lib/credential-vault";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAnonymousSession(request, { requireCsrf: true });
    await assertRateLimit({ key: `credential-delete:${session.ownerSessionHash}:${getClientIp(request)}`, limit: 20, windowMs: 60 * 60 * 1000 });
    const { id } = await params;
    await revokeCredential(session.ownerSessionHash, id);
    return NextResponse.json({ status: "revoked" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiConnectionsErrorResponse(error);
  }
}
