import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { Code2, ExternalLink, HeartHandshake, MessageCircle, QrCode } from "lucide-react";
import { getServerEnv } from "@/lib/env";

export const metadata = { title: "支持与交流 | RealNeed" };

export default function SupportPage() {
  const env = getServerEnv();
  const message = env.instanceSupportMessage ?? "RealNeed 是免费开源项目。赞赏完全自愿，不影响任何功能、报告质量、使用权限或技术支持资格。";

  return (
    <main className="min-h-screen bg-paper px-4 py-10 text-ink sm:px-6 sm:py-14">
      <section className="mx-auto max-w-3xl">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-helper"><HeartHandshake className="h-4 w-4 text-ink" />Support RealNeed</p>
        <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">支持与交流</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-graphite">{message}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <SupportPanel title="自愿赞赏" icon={<HeartHandshake className="h-5 w-5" />}>
            {env.instanceDonationQrUrl ? <><Image src={env.instanceDonationQrUrl} alt="RealNeed 自愿赞赏二维码" width={176} height={176} unoptimized className="mt-4 aspect-square w-44 rounded-[6px] border border-line bg-white object-contain p-2" /><p className="mt-3 text-sm leading-6 text-helper">扫码即可。赞赏不解锁任何功能，也不影响报告生成。</p></> : <p className="mt-3 text-sm leading-6 text-helper">此实例暂未配置赞赏二维码。</p>}
          </SupportPanel>
          <SupportPanel title="联系开发者" icon={<MessageCircle className="h-5 w-5" />}>
            {env.instanceContactWechat ? <p className="mt-4 text-sm">微信号：<span className="font-mono font-semibold">{env.instanceContactWechat}</span></p> : null}
            {env.instanceContactQrUrl ? <Image src={env.instanceContactQrUrl} alt="RealNeed 联系方式二维码" width={176} height={176} unoptimized className="mt-4 aspect-square w-44 rounded-[6px] border border-line bg-white object-contain p-2" /> : null}
            {!env.instanceContactWechat && !env.instanceContactQrUrl ? <p className="mt-3 text-sm leading-6 text-helper">此实例暂未配置联系方式。</p> : <p className="mt-3 text-sm leading-6 text-helper">产品反馈、部署问题和合作交流都可以在这里联系。</p>}
          </SupportPanel>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {env.instanceGithubUrl ? <ExternalResource href={env.instanceGithubUrl} label="查看开源仓库" icon={<Code2 className="h-4 w-4" />} /> : null}
          {env.instanceIssuesUrl ? <ExternalResource href={env.instanceIssuesUrl} label="提交问题" icon={<QrCode className="h-4 w-4" />} /> : null}
        </div>
        <Link href="/" className="mt-8 inline-flex text-sm font-semibold underline underline-offset-4">回到 RealNeed</Link>
      </section>
    </main>
  );
}

function SupportPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="rounded-[8px] border border-line bg-white p-5 shadow-paper"><div className="flex items-center gap-2 text-lg font-semibold">{icon}{title}</div>{children}</section>;
}

function ExternalResource({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-line bg-white px-4 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-ink/30">{icon}{label}<ExternalLink className="h-3.5 w-3.5 text-helper" /></a>;
}
