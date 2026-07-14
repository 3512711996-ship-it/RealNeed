import { NextResponse } from "next/server";
import { requireAnonymousSession } from "@/lib/anonymous-session";
import { connectionInputSchema } from "@/lib/api-connections-schema";
import { apiConnectionsErrorResponse } from "@/lib/api-connections-response";
import { createConnectionTestProof } from "@/lib/credential-vault";
import { testProviderConnection } from "@/lib/provider-connection-test";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(length) && length > 4096) throw Object.assign(new Error("请求体超过安全大小限制。"), { status: 413 });
    const session = await requireAnonymousSession(request, { requireCsrf: true });
    await assertRateLimit({ key: `credential-test:${session.ownerSessionHash}:${getClientIp(request)}`, limit: 8, windowMs: 60 * 60 * 1000, message: "连接测试过于频繁，请稍后再试。" });
    const parsed = connectionInputSchema.safeParse(await request.json());
    if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "API 连接格式不正确。"), { status: 400 });
    const data = parsed.data;
    const result = await testProviderConnection({ kind: data.kind, provider: data.provider, apiKey: data.apiKey, model: data.model });
    const testProof = createConnectionTestProof({ ownerSessionHash: session.ownerSessionHash, kind: data.kind, provider: data.provider, model: data.model, apiKey: data.apiKey });
    return NextResponse.json({ status: "connected", provider: result.provider, model: "model" in result ? result.model : null, providerRequestId: result.providerRequestId, durationMs: result.durationMs, keyLastFour: data.apiKey.slice(-4), testProof }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiConnectionsErrorResponse(error, "连接测试失败，供应商没有返回可验证结果。");
  }
}
