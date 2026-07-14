import { buildDeepDiveUrl, generateOpaqueToken, hashToken } from "@/lib/crypto-tokens";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/** Creates a single private link. The plaintext token is returned only to the caller. */
export async function replaceReportAccessLink(deepDiveReportId: string) {
  const token = generateOpaqueToken("rn_report");
  const expiresAt = new Date(Date.now() + getServerEnv().reportLinkRetentionDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.reportAccessLink.updateMany({
      where: { deepDiveReportId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() }
    }),
    prisma.reportAccessLink.create({
      data: { deepDiveReportId, tokenHash: hashToken(token), status: "ACTIVE", expiresAt }
    })
  ]);

  return { reportUrl: buildDeepDiveUrl(token), expiresAt };
}
