import { NextResponse } from "next/server";
import { ensureAnonymousSession, requireAnonymousSession } from "@/lib/anonymous-session";
import { saveConnectionInputSchema } from "@/lib/api-connections-schema";
import { apiConnectionsErrorResponse } from "@/lib/api-connections-response";
import { createConnectionTestProof, listCredentials, saveVerifiedCredential, verifyConnectionTestProof } from "@/lib/credential-vault";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await ensureAnonymousSession();
    const credentials = await listCredentials(session.ownerSessionHash);
    return NextResponse.json({ credentials, csrfToken: session.csrfToken }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiConnectionsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    enforceBodySize(request, 4096);
    const session = await requireAnonymousSession(request, { requireCsrf: true });
    await assertRateLimit({ key: `credential-save:${session.ownerSessionHash}:${getClientIp(request)}`, limit: 12, windowMs: 60 * 60 * 1000, message: "API 连接保存过于频繁，请稍后再试。" });
    const parsed = saveConnectionInputSchema.safeParse(await request.json());
    if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "API 连接格式不正确。"), { status: 400 });
    const data = parsed.data;
    if (!verifyConnectionTestProof({ proof: data.testProof, ownerSessionHash: session.ownerSessionHash, kind: data.kind, provider: data.provider, model: data.model, apiKey: data.apiKey })) {
      throw Object.assign(new Error("连接测试已过期或与当前 Key 不匹配，请重新测试。"), { status: 409 });
    }
    const credential = await saveVerifiedCredential({ ownerSessionHash: session.ownerSessionHash, kind: data.kind, provider: data.provider, apiKey: data.apiKey, selectedModel: data.model });
    return NextResponse.json({ status: "connected", credential }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiConnectionsErrorResponse(error);
  }
}

function enforceBodySize(request: Request, max: number) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > max) throw Object.assign(new Error("请求体超过安全大小限制。"), { status: 413 });
}

export function buildConnectionTestProof(input: { ownerSessionHash: string; kind: string; provider: string; model?: string | null; apiKey: string }) {
  return createConnectionTestProof(input);
}
