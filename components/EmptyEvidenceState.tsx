import Link from "next/link";
import { ClipboardPaste, FileSearch } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function EmptyEvidenceState() {
  return (
    <div className="mx-auto max-w-2xl rounded-card border border-line bg-white p-6 text-left shadow-paper sm:p-8">
      <div className="grid h-12 w-12 place-items-center rounded-input border border-line bg-lime/20">
        <FileSearch className="h-5 w-5 text-ink" />
      </div>
      <h1 className="mt-4 text-3xl font-semibold text-ink">没有找到足够可信的真实需求证据。</h1>

      <div className="mt-5 grid gap-4 text-sm leading-6 text-graphite sm:grid-cols-2">
        <div>
          <h2 className="font-semibold text-ink">可能原因：</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>这个想法太泛</li>
            <li>搜索结果质量太差</li>
            <li>来源页面无法访问</li>
            <li>公开网页里没有明显用户痛点</li>
          </ol>
        </div>

        <div>
          <h2 className="font-semibold text-ink">你可以：</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>换一种更具体的说法</li>
            <li>使用手动粘贴模式</li>
            <li>粘贴 Reddit / 知乎 / 小红书 / 抖音评论内容</li>
          </ul>
        </div>
      </div>

      <Link href="/?mode=manual_paste" className={buttonVariants({ className: "mt-6" })}>
        <ClipboardPaste className="h-4 w-4" />
        切换到手动粘贴模式
      </Link>
    </div>
  );
}
