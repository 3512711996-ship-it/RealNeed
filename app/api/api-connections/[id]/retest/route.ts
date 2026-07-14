import { NextResponse } from "next/server";
import { requireAnonymousSession } from "@/lib/anonymous-session";
import { apiConnectionsErrorResponse } from "@/lib/api-connections-response";
import { decryptCredentialForCall, markCredentialInvalid } from "@/lib/credential-vault";
import { prisma } from "@/lib/prisma";
import { testProviderConnection } from "@/lib/provider-connection-test";
import { ProviderExecutionError } from "@/lib/providers/shared-errors";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAnonymousSession(request, { requireCsrf: true });
    await assertRateLimit({ key: `credential-retest:${session.ownerSessionHash}:${getClientIp(request)}`, limit: 8, windowMs: 60 * 60 * 1000 });
    const { id } = await params;
    const metadata = await prisma.apiCredential.findFirst({ where: { id, ownerSessionHash: session.ownerSessionHash }, select: { id: true, kind: true, provider: true, selectedModel: true } });
    if (!metadata) throw Object.assign(new Error("没有找到这个 API 连接。"), { status: 404 });
    const decrypted = await decryptCredentialForCall({ credentialId: id, ownerSessionHash: session.ownerSessionHash, kind: metadata.kind, provider: metadata.provider });
    try {
      const result = await testProviderConnection({ kind: metadata.kind, provider: metadata.provider, apiKey: decrypted.apiKey, model: metadata.selectedModel });
      await prisma.apiCredential.update({ where: { id }, data: { status: "ACTIVE", lastVerifiedAt: new Date() } });
      return NextResponse.json({ status: "connected", provider: result.provider, durationMs: result.durationMs }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof ProviderExecutionError && ["USER_API_KEY_INVALID", "USER_MODEL_NOT_ALLOWED", "USER_MODEL_NOT_FOUND"].includes(error.code)) await markCredentialInvalid(id);
      throw error;
    }
  } catch (error) {
    return apiConnectionsErrorResponse(error, "重新测试连接失败。");
  }
}
