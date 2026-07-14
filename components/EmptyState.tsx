import Link from "next/link";
import { FileSearch } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function EmptyState({
  title = "还没有可展示的判断报告",
  description = "先回到首页输入一个想法，或切换到手动粘贴模式提供真实评论和帖子。",
  actionLabel = "回到首页"
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mx-auto grid max-w-xl place-items-center rounded-card border border-line bg-white p-8 text-center shadow-paper">
      <div className="grid h-12 w-12 place-items-center rounded-input border border-line bg-lime/20">
        <FileSearch className="h-5 w-5" />
      </div>
      <h1 className="mt-4 text-3xl font-semibold text-ink">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-helper">{description}</p>
      <Link href="/" className={buttonVariants({ className: "mt-5" })}>
        {actionLabel}
      </Link>
    </div>
  );
}
