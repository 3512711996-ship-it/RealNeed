"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const slides = [
  {
    eyebrow: "Slide 01",
    title: "RealNeed",
    body: "输入一个想法，先找真实需求。",
    footnote: "Evidence before opportunity."
  },
  {
    eyebrow: "Slide 02",
    title: "问题",
    body: "刚会 Vibe Coding 的人，不是不会做，而是不知道什么值得做。",
    footnote: "能力开始变便宜，判断变得更贵。"
  },
  {
    eyebrow: "Slide 03",
    title: "错误方式",
    body: "直接问 AI：给我 10 个创业点子。结果通常是泛泛灵感。",
    footnote: "灵感没有证据，就很容易变成自嗨。"
  },
  {
    eyebrow: "Slide 04",
    title: "我们的方式",
    body: "先搜索真实需求证据，再生成小产品机会。",
    footnote: "用户说过、抱怨过、求助过，才值得继续。"
  },
  {
    eyebrow: "Slide 05",
    title: "产品流程",
    body: "Idea → Evidence → Opportunity → MVP → Validation",
    footnote: "每一步都压缩不确定性。"
  },
  {
    eyebrow: "Slide 06",
    title: "免费开源",
    body: "判断、证据墙、MVP 与 Deep Dive 都免费。",
    footnote: "第三方 API 费用由用户自己的账户承担。"
  },
  {
    eyebrow: "Slide 07",
    title: "自带 API",
    body: "用户连接自己的搜索与生成模型 API。",
    footnote: "Key 失效就暂停，不会偷偷切换平台 Key。"
  },
  {
    eyebrow: "Slide 08",
    title: "下一步",
    body: "先验证有没有真实用户痛点，再决定要不要做产品。",
    footnote: "Evidence before opportunity."
  }
];

export default function PitchPage() {
  return (
    <main className="min-h-screen bg-ink text-paper">
      <header className="sticky top-0 z-20 border-b border-paper/10 bg-ink/88 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-paper/68 transition hover:text-paper">
            <ArrowLeft className="h-4 w-4" />
            返回产品
          </Link>
          <span className="text-sm text-paper/50">RealNeed Pitch</span>
        </div>
      </header>

      <div className="mx-auto max-w-[1120px] px-4 sm:px-6">
        {slides.map((slide, index) => (
          <motion.section
            key={slide.eyebrow}
            className="grid min-h-[calc(100vh-65px)] snap-start place-items-center border-b border-paper/10 py-12"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.4 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <div className="w-full">
              <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-lime">{slide.eyebrow}</p>
              <div className="grid gap-8 lg:grid-cols-[0.72fr_1fr] lg:items-end">
                <h1 className="text-[44px] font-semibold leading-none text-paper sm:text-[72px] lg:text-[96px]">
                  {slide.title}
                </h1>
                <div>
                  <p className="text-[24px] font-semibold leading-tight text-paper sm:text-[38px]">{slide.body}</p>
                  <p className="mt-6 max-w-xl text-[15px] leading-7 text-paper/58">{slide.footnote}</p>
                </div>
              </div>
              <div className="mt-10 flex items-center justify-between text-sm text-paper/42">
                <span>{String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
                <span className="hidden sm:inline">向下滚动继续</span>
              </div>
            </div>
          </motion.section>
        ))}

        <section className="py-10">
          <Link href="/" className={buttonVariants({ variant: "accent", size: "lg" })}>
            回到 RealNeed
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </main>
  );
}
