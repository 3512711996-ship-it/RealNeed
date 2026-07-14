import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAnonymousSession } from "@/lib/anonymous-session";
import { generationExecutionConfigSchema } from "@/lib/providers/execution-config";
import { parseDeepDiveMode } from "@/lib/deep-dive-eligibility";
import { queueDeepDive } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const requestSchema = z.object({
  mode: z.enum(["EVIDENCE_EXECUTION", "IDEA_SIGNAL_REPAIR"]).optional(),
  generation: generationExecutionConfigSchema
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAnonymousSession(request, { requireCsrf: true });
    await assertRateLimit({ key: `free-deep-dive:${session.ownerSessionHash}:${getClientIp(request)}`, limit: 6, windowMs: 60 * 60 * 1000, message: "报告生成请求过于频繁，请稍后再试。" });
    const payload = requestSchema.parse(await request.json());
    const { id } = await params;
    const record = await prisma.ideaJudgmentRecord.findFirst({
      where: { id, deletedAt: null },
      select: { reportCode: true }
    });
    if (!record) return NextResponse.json({ message: "没有找到这份判断报告。" }, { status: 404 });

    const queued = await queueDeepDive(record.reportCode, {
      ownerSessionHash: session.ownerSessionHash,
      mode: parseDeepDiveMode(payload.mode) ?? undefined,
      generation: payload.generation
    });
    await prisma.analyticsEvent.create({ data: { anonymousSessionId: session.sessionId, eventType: "free_report_generation_requested", judgmentId: id, propertiesJson: { mode: payload.mode ?? null, provider: payload.generation.provider } } }).catch(() => undefined);
    return NextResponse.json({ status: "queued", ...queued }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 500;
    const message = error instanceof Error ? error.message : "无法创建免费报告任务。";
    return NextResponse.json({ message: /Prisma|DATABASE_URL|D:\\|C:\\|SQL|\.next/i.test(message) ? "无法创建免费报告任务，请稍后重试。" : message.slice(0, 260) }, { status: Number.isFinite(status) ? status : 500 });
  }
}
