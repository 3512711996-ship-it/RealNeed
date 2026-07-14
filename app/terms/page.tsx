import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-paper px-4 py-10 text-ink sm:px-6">
      <article className="mx-auto max-w-[820px] rounded-[8px] border border-line bg-white p-6 shadow-paper sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-helper">Terms</p>
        <h1 className="mt-3 text-4xl font-semibold">RealNeed 内测服务说明</h1>
        <div className="mt-6 grid gap-5 text-sm leading-7 text-graphite">
          <section><h2 className="text-xl font-semibold text-ink">服务范围</h2><p className="mt-2">RealNeed 是免费开源工具。Deep Dive 使用你连接的生成模型 API 生成；第三方 API 可能按其自身规则收费。证据型报告仅基于合格证据，补足型报告不声称需求已成立。</p></section>
          <section><h2 className="text-xl font-semibold text-ink">交付</h2><p className="mt-2">报告完成后系统会自动创建可撤销、可过期的私有链接。无需付款、管理员确认或人工发送。</p></section>
          <section><h2 className="text-xl font-semibold text-ink">失败处理</h2><p className="mt-2">用户 API 失效、额度不足或模型无权限时，任务会暂停等待你更新连接；系统不会改用平台 API 或生成替代报告。</p></section>
          <section><h2 className="text-xl font-semibold text-ink">不包含</h2><p className="mt-2">服务不包含代开发、法律/医疗/投资建议、持续咨询、自动获客或商业结果保证。</p></section>
          <section><h2 className="text-xl font-semibold text-ink">免责声明</h2><p className="mt-2">RealNeed 帮助整理公开来源与验证动作，不保证赚钱，不保证市场需求成立，也不替代用户访谈、预售或真实收费测试。</p></section>
        </div>
        <div className="mt-8 flex gap-4 text-sm font-semibold"><Link href="/" className="underline underline-offset-4">返回首页</Link><Link href="/privacy" className="underline underline-offset-4">隐私政策</Link></div>
      </article>
    </main>
  );
}
