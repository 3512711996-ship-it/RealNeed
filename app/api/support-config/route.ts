import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const env = getServerEnv();
  return NextResponse.json({
    developerName: env.instanceDeveloperName ?? null,
    contactWechat: env.instanceContactWechat ?? null,
    contactQrUrl: env.instanceContactQrUrl ?? null,
    donationQrUrl: env.instanceDonationQrUrl ?? null,
    githubUrl: env.instanceGithubUrl ?? null,
    issuesUrl: env.instanceIssuesUrl ?? null,
    message: env.instanceSupportMessage ?? "RealNeed 是免费开源项目。打赏完全自愿，不影响任何功能、报告质量、使用权限或技术支持资格。"
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
