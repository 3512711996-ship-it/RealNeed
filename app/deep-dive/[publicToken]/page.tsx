import Link from "next/link";
import { headers } from "next/headers";
import { DeepDiveReport } from "@/components/DeepDiveReport";
import { hashToken } from "@/lib/crypto-tokens";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIpFromHeaders, RateLimitError } from "@/lib/rate-limit";
import type { DeepDiveReport as DeepDiveReportType } from "@/lib/types";

export const metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default async function DeepDivePage({ params }: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await params;
  try {
    const requestHeaders = await headers();
    await assertRateLimit({
      key: `deep-dive-view:${getClientIpFromHeaders(requestHeaders)}`,
      limit: 90,
      windowMs: 60 * 60 * 1000,
      message: "报告访问过于频繁。"
    });
  } catch (error) {
    return (
      <StatePage
        eyebrow={error instanceof RateLimitError ? "Too Many Requests" : "Access Protection Unavailable"}
        title={error instanceof RateLimitError ? "报告访问过于频繁" : "报告访问保护暂时不可用"}
        description="请稍后再打开这份报告。RealNeed 不会在访问保护失效时绕过限流。"
      />
    );
  }
  let accessLink: { id: string; status: string; expiresAt: Date | null; deepDiveReport: { reportJson: unknown } } | null = null;

  try {
    accessLink = await prisma.reportAccessLink.findUnique({
      where: { tokenHash: hashToken(publicToken) },
      include: { deepDiveReport: { select: { reportJson: true } } }
    });
  } catch {
    return (
      <StatePage
        eyebrow="Database Unavailable"
        title="暂时无法读取 Deep Dive 报告"
        description="当前服务端数据库还没有配置好，或数据库连接不可用。请稍后再打开你的私有报告链接。"
      />
    );
  }

  if (!accessLink) {
    return <StatePage eyebrow="Not Found" title="没有找到这份 Deep Dive 报告" description="请检查私有链接是否完整，或在原结果页重新生成链接。" />;
  }

  if (accessLink.status !== "ACTIVE") {
    return <StatePage eyebrow="Revoked" title="这份 Deep Dive 链接已失效" description="这通常是因为报告所有者撤销了旧链接，或报告已经超过访问期限。" />;
  }

  if (isExpired(accessLink.expiresAt)) {
    await prisma.reportAccessLink.update({ where: { id: accessLink.id }, data: { status: "EXPIRED" } });
    return <StatePage eyebrow="Expired" title="这份 Deep Dive 链接已过期" description="请在原结果页使用恢复链接重新生成访问链接。" />;
  }

  await prisma.reportAccessLink.update({
    where: { id: accessLink.id },
    data: {
      lastAccessedAt: new Date(),
      viewCount: { increment: 1 }
    }
  });

  return (
    <main className="min-h-screen bg-paper">
      <DeepDiveReport report={accessLink.deepDiveReport.reportJson as unknown as DeepDiveReportType} />
    </main>
  );
}

function StatePage({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
      <div className="max-w-lg rounded-[10px] border border-line bg-white p-8 text-center shadow-paper">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-helper">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-helper">{description}</p>
        <Link href="/" className="mt-5 inline-flex rounded-[8px] border border-line bg-lime px-4 py-2 text-sm font-semibold">
          回到 RealNeed
        </Link>
      </div>
    </main>
  );
}

function isExpired(expiresAt: Date | null) {
  return Boolean(expiresAt && expiresAt.getTime() < new Date().getTime());
}
