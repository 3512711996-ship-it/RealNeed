"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { IdeaJudgment } from "@/lib/types";

export default function RecoverPage() {
  const router = useRouter();
  const [message, setMessage] = useState("正在验证恢复链接…");

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
    window.history.replaceState(null, "", "/recover");
    if (!token) {
      setMessage("恢复链接缺少 token，无法打开报告。");
      return;
    }

    void fetch("/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store"
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { judgmentId?: string; judgment?: IdeaJudgment; message?: string };
        if (!response.ok || !payload.judgmentId || !payload.judgment) throw new Error(payload.message ?? "恢复链接无效。");
        const recoveryUrl = `${window.location.origin}/recover#token=${encodeURIComponent(token)}`;
        sessionStorage.setItem(`realneed:recovery:${payload.judgmentId}`, recoveryUrl);
        sessionStorage.setItem("realneed:last-recovery-url", recoveryUrl);
        sessionStorage.setItem("realneed:last-judgment", JSON.stringify({ ...payload.judgment, recoveryUrl }));
        router.replace(`/results?judgmentId=${encodeURIComponent(payload.judgmentId)}`);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "恢复报告失败。"));
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
      <div className="max-w-md rounded-[8px] border border-line bg-white p-6 text-center shadow-paper">
        <h1 className="text-xl font-semibold">恢复 RealNeed 报告</h1>
        <p className="mt-3 text-sm leading-6 text-helper">{message}</p>
        <Link href="/" className="mt-5 inline-flex text-sm font-semibold underline underline-offset-4">返回首页</Link>
      </div>
    </main>
  );
}
