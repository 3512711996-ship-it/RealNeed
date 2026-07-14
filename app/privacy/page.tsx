import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-paper px-4 py-10 text-ink sm:px-6">
      <article className="mx-auto max-w-[820px] rounded-[12px] border border-line bg-white p-6 shadow-paper sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-helper">Privacy</p>
        <h1 className="mt-3 text-4xl font-semibold">RealNeed 保存什么</h1>
        <div className="mt-6 grid gap-5 text-sm leading-7 text-graphite">
          <section>
            <h2 className="text-xl font-semibold text-ink">会保存</h2>
            <p className="mt-2">产品想法、判断报告、搜索来源元数据、短正文摘录、证据分类、后台任务事件和 API 成本记录。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-ink">不会公开</h2>
            <p className="mt-2">你的想法、恢复 token、私有报告 token、管理员密码和 API Key 不会公开展示。用户 API Key 只以加密形式保存，页面和管理员后台都不能读取明文。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-ink">保存多久</h2>
            <p className="mt-2">默认免费报告保留 30 天，来源正文摘录保留 7 天，匿名事件保留 180 天，API 用量审计保留 365 天。生产环境通过独立清理命令或 DATA_CLEANUP Worker Job 执行。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-ink">如何删除</h2>
            <p className="mt-2">使用恢复链接打开报告后，可以请求删除。删除会撤销私有访问链接，清除来源、搜索请求、任务输入和报告正文，只保留删除操作所需的最小审计。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-ink">清理保护</h2>
            <p className="mt-2">正在生成的任务不会被自动过期清理。恢复 token 只保存哈希，新恢复链接把 token 放在浏览器 fragment 中，不进入普通请求 URL。</p>
          </section>
        </div>
        <Link href="/" className="mt-8 inline-flex rounded-[8px] border border-line bg-lime px-4 py-2 text-sm font-semibold">
          回到 RealNeed
        </Link>
      </article>
    </main>
  );
}
