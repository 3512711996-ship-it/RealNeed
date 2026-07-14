import Link from "next/link";
import { ArrowLeft, ClipboardPaste, SignalZero } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function NoSignalState({
  hasAccessibleSources,
  message
}: {
  hasAccessibleSources: boolean;
  message?: string;
}) {
  const title = hasAccessibleSources ? "这次没有足够强的需求信号。" : "这次没有找到可访问来源。";
  const description = hasAccessibleSources
    ? "系统找到了可访问来源，但多数只是弱相关、泛讨论，或者没有明确用户痛点。所以本次不直接推荐开发方向。"
    : "搜索返回了候选结果，但链接无法访问、已删除、404 或被平台限制。你可以换更具体的说法，或切换到手动粘贴模式。";

  return (
    <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="relative overflow-hidden rounded-[10px] border border-line bg-white p-6 shadow-paper sm:p-8">
        <div className="absolute inset-0 scan-grid opacity-[0.28]" />
        <div className="relative max-w-2xl">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-[8px] border border-line bg-lime/20">
            <SignalZero className="h-5 w-5 text-ink" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-helper">No Signal Found</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight text-ink sm:text-4xl">{title}</h1>
          <p className="mt-4 text-sm leading-7 text-graphite">{message ?? description}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft className="h-4 w-4" />
              换个说法再试一次
            </Link>
            <Link href="/?mode=manual_paste" className={buttonVariants({ variant: "accent" })}>
              <ClipboardPaste className="h-4 w-4" />
              切换到手动粘贴模式
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
