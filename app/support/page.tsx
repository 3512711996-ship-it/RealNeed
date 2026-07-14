import Link from "next/link";
import { getServerEnv } from "@/lib/env";

export const metadata = { title: "支持 RealNeed" };

export default function SupportPage() {
  const env = getServerEnv();
  const message = env.instanceSupportMessage ?? "RealNeed 是免费开源项目。打赏完全自愿，不影响任何功能、报告质量、使用权限或技术支持资格。";
  return <main className="min-h-screen bg-paper px-4 py-12 text-ink sm:px-6"><section className="mx-auto max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-helper">Support RealNeed</p><h1 className="mt-3 text-4xl font-semibold">支持与交流</h1><p className="mt-5 text-base leading-8 text-graphite">{message}</p><div className="mt-8 grid gap-3 rounded-[8px] border border-line bg-white p-5 shadow-paper">{env.instanceDonationQrUrl ? <a className="font-semibold underline underline-offset-4" href={env.instanceDonationQrUrl} target="_blank" rel="noreferrer">自愿打赏</a> : <p className="text-sm text-helper">此实例暂未配置打赏入口。</p>}{env.instanceContactWechat ? <p className="text-sm">微信交流：<span className="font-mono font-semibold">{env.instanceContactWechat}</span></p> : null}{env.instanceGithubUrl ? <a className="font-semibold underline underline-offset-4" href={env.instanceGithubUrl} target="_blank" rel="noreferrer">查看开源仓库</a> : null}{env.instanceIssuesUrl ? <a className="font-semibold underline underline-offset-4" href={env.instanceIssuesUrl} target="_blank" rel="noreferrer">提交 Bug</a> : null}</div><Link href="/" className="mt-8 inline-flex text-sm font-semibold underline underline-offset-4">回到 RealNeed</Link></section></main>;
}
