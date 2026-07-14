"use client";

import { motion } from "framer-motion";
import { ArrowDown, FileQuestion, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { IdeaInput } from "@/components/IdeaInput";
import { LiveScanPreview } from "@/components/LiveScanPreview";
import { RealNeedLogo } from "@/components/RealNeedLogo";
import { buttonVariants } from "@/components/ui/button";

const process = ["输入想法", "澄清人群和场景", "读取需求信号", "判断值不值得做"];

export function Hero() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/88 backdrop-blur">
        <nav className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-xl font-semibold tracking-normal">
            <span className="grid h-8 w-8 place-items-center rounded-[7px] bg-ink text-paper">
              <RealNeedLogo className="h-5 w-5" />
            </span>
            RealNeed
          </Link>
          <div className="hidden items-center gap-5 text-sm text-graphite md:flex">
            <a href="#process" className="transition hover:text-ink">
              判断流程
            </a>
            <a href="#start" className="transition hover:text-ink">
              开始判断
            </a>
            <a href="/api-connections" className="transition hover:text-ink">
              API 连接
            </a>
            <a href="/support" className="transition hover:text-ink">
              支持项目
            </a>
            <span className="inline-flex items-center gap-1 text-helper">
              <ShieldCheck className="h-4 w-4" />
              evidence-first
            </span>
          </div>
          <a href="#start" data-cursor="scan" data-cursor-magnetic="true" className={buttonVariants({ variant: "outline", size: "sm" })}>
            开始判断
          </a>
        </nav>
      </header>

      <section className="paper-grid border-b border-line">
        <div className="mx-auto grid max-w-[1120px] gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:min-h-[calc(100vh-73px)] lg:grid-cols-[1fr_0.86fr] lg:items-center">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <p className="mb-4 inline-flex items-center gap-2 rounded-[6px] border border-line bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-helper">
              <FileQuestion className="h-3.5 w-3.5 text-ink" />
              Small product judgment engine
            </p>
            <h1 className="max-w-4xl text-[42px] font-semibold leading-[1.04] text-ink sm:text-[58px] lg:text-[70px]">
              输入一个想法，判断它值不值得做成小产品。
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-8 text-graphite">
              别急着写代码。RealNeed 会先查真实需求信号，判断这个想法有没有人真的痛、有没有付费可能、能不能砍成 1-3 天能做的 MVP。
            </p>
            <p className="mt-4 max-w-2xl rounded-[8px] border border-line bg-white px-4 py-3 text-sm leading-6 text-helper shadow-paper">
              不是每个想法都值得做。真正重要的是：写代码前，先判断有没有人需要。
            </p>

            <div id="process" className="mt-7 flex flex-wrap gap-2">
              {process.map((item, index) => (
                <motion.span
                  key={item}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: 0.16 + index * 0.07 }}
                  className="rounded-[6px] border border-line bg-white px-3 py-2 text-sm font-semibold text-ink shadow-paper"
                >
                  {index + 1}. {item}
                </motion.span>
              ))}
            </div>

            <a href="#start" data-cursor="scan" data-cursor-magnetic="true" className={buttonVariants({ variant: "accent", size: "lg", className: "mt-8 transition hover:-translate-y-0.5" })}>
              开始判断
              <ArrowDown className="h-4 w-4" />
            </a>
          </motion.div>

          <LiveScanPreview />
        </div>
      </section>

      <section id="start" className="mx-auto grid max-w-[1120px] gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <p className="text-sm font-semibold text-helper">Judgment Control</p>
          <h2 className="mt-2 text-[30px] font-semibold leading-tight text-ink sm:text-[38px]">把想法放进判断台</h2>
          <p className="mt-3 text-sm leading-7 text-graphite">
            自动搜索适合还没有素材时使用；手动粘贴适合你已经看到真实评论、帖子或用户反馈。系统会明确区分“外部可验证来源”和“用户粘贴内容”。
          </p>
          <div className="mt-5 rounded-[8px] border border-line bg-white p-4 shadow-paper">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <ShieldCheck className="h-4 w-4" />
              判断原则
            </div>
            <ul className="grid gap-2 text-sm leading-6 text-helper">
              <li>信号太弱，不建议直接开发。</li>
              <li>来源打不开，不算真实证据。</li>
              <li>不能压成新手 MVP，就不推荐。</li>
              <li>每个机会必须绑定来源信号。</li>
            </ul>
          </div>
        </div>

        <IdeaInput />
      </section>
    </main>
  );
}
