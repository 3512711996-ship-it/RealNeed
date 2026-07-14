"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";

type LegacyOrder = { id: string; reportCode: string; originalIdea: string; paymentStatus: string; generationStatus: string; deliveryStatus: string; createdAt: string };

/** Historical payment records are retained for audit only. */
export default function LegacyOrdersPage() {
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<LegacyOrder[]>([]);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  async function load() {
    const params = new URLSearchParams({ legacy: "true", limit: "100" });
    if (query.trim()) params.set("q", query.trim());
    const response = await fetch(`/api/admin/orders?${params}`, { cache: "no-store" });
    const payload = (await response.json()) as { orders?: LegacyOrder[]; message?: string };
    if (!response.ok) { setMessage(payload.message ?? "无法读取历史订单。"); return; }
    setOrders(payload.orders ?? []);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (!response.ok) { setMessage("登录失败，请检查管理员配置。"); return; }
    setReady(true);
    void load();
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-6">
      <section className="mx-auto max-w-5xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4"><ArrowLeft className="h-4 w-4" />返回首页</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-helper">Legacy records</p>
        <h1 className="mt-2 text-3xl font-semibold">历史订单</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-graphite">支付、退款和人工发货已下线。本页只保留旧数据审计，不会创建报告、改变权限或处理付款。</p>
        {!ready ? <form onSubmit={login} className="mt-6 flex max-w-md gap-2"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="管理员密码" className="field-input" /><button className="rounded-[7px] bg-ink px-4 text-sm font-semibold text-paper">查看</button></form> : <>
          <form onSubmit={(event) => { event.preventDefault(); void load(); }} className="mt-6 flex max-w-md gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="报告编号或想法" className="field-input" /><button className="inline-flex items-center gap-2 rounded-[7px] border border-line px-4 text-sm font-semibold"><Search className="h-4 w-4" />筛选</button></form>
          <div className="mt-6 overflow-hidden rounded-[8px] border border-line bg-white">
            {orders.length ? orders.map((order) => <div key={order.id} className="grid gap-2 border-b border-line p-4 last:border-b-0 sm:grid-cols-[1fr_auto]"><div><p className="font-mono text-sm font-semibold">{order.reportCode}</p><p className="mt-1 text-sm text-graphite">{order.originalIdea}</p><p className="mt-1 text-xs text-helper">创建于 {new Date(order.createdAt).toLocaleString("zh-CN")}</p></div><p className="text-xs text-helper">{order.paymentStatus} · {order.generationStatus} · {order.deliveryStatus}</p></div>) : <p className="p-5 text-sm text-helper">没有符合条件的历史订单。</p>}
          </div>
        </>}
        {message ? <p className="mt-4 text-sm text-clay">{message}</p> : null}
      </section>
    </main>
  );
}
