import { NextResponse } from "next/server";
import { z } from "zod";
import { hashToken } from "@/lib/crypto-tokens";
import { replaceReportAccessLink } from "@/lib/report-access-links";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
const payloadSchema = z.object({ recoveryToken: z.string().min(20).max(240), action: z.enum(["REGENERATE", "REVOKE"]) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const payload = payloadSchema.parse(await request.json());
    await assertRateLimit({ key: `report-link:${getClientIp(request)}`, limit: 12, windowMs: 60 * 60 * 1000, message: "报告链接操作过于频繁，请稍后再试。" });
    const { reportId } = await params;
    const record = await prisma.ideaJudgmentRecord.findFirst({ where: { id: reportId, recoveryTokenHash: hashToken(payload.recoveryToken), deletedAt: null }, include: { deepDiveReport: true } });
    if (!record?.deepDiveReport) return NextResponse.json({ message: "恢复 token 无效，或尚未生成 Deep Dive 报告。" }, { status: 403 });
    if (payload.action === "REVOKE") {
      await prisma.reportAccessLink.updateMany({ where: { deepDiveReportId: record.deepDiveReport.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
      return NextResponse.json({ ok: true, revoked: true });
    }
    const link = await replaceReportAccessLink(record.deepDiveReport.id);
    return NextResponse.json({ ok: true, reportUrl: link.reportUrl, expiresAt: link.expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法更新私有报告链接。";
    return NextResponse.json({ message: /Prisma|DATABASE_URL|D:\\|C:\\|SQL/i.test(message) ? "无法更新私有报告链接，请稍后再试。" : message.slice(0, 240) }, { status: 400 });
  }
}
