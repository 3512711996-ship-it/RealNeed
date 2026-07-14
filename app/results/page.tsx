"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { JudgmentReport } from "@/components/JudgmentReport";
import { FreeDeepDiveModal } from "@/components/FreeDeepDiveModal";
import { RealNeedLogo } from "@/components/RealNeedLogo";
import { ReportRecoveryControls } from "@/components/ReportRecoveryControls";
import { resultStorageKey } from "@/components/IdeaInput";
import type { IdeaJudgment } from "@/lib/types";

export default function ResultsPage() {
  const [data, setData] = useState<IdeaJudgment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [deepDiveJobId, setDeepDiveJobId] = useState<string | null>(null);
  const [deepDiveUrl, setDeepDiveUrl] = useState<string | null>(null);
  const [deepDiveMessage, setDeepDiveMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const judgmentId = params.get("judgmentId");

    async function load() {
      try {
        if (judgmentId) {
          const response = await fetch(`/api/judgments/${encodeURIComponent(judgmentId)}`, { cache: "no-store" });
          if (!response.ok) {
            const stored = sessionStorage.getItem(resultStorageKey);
            if (stored) {
              const saved = JSON.parse(stored) as IdeaJudgment;
              if (saved.judgmentId === judgmentId) { setData(saved); return; }
            }
            throw new Error("没有找到这份判断报告。");
          }
          const payload = (await response.json()) as { judgment: IdeaJudgment };
          const recoveryUrl = sessionStorage.getItem(`realneed:recovery:${judgmentId}`) ?? sessionStorage.getItem("realneed:last-recovery-url");
          setData({
            ...payload.judgment,
            judgmentId,
            recoveryUrl: recoveryUrl ? new URL(recoveryUrl, window.location.origin).toString() : payload.judgment.recoveryUrl
          });
          return;
        }

        const stored = sessionStorage.getItem(resultStorageKey);

        if (stored) {
          setData(JSON.parse(stored) as IdeaJudgment);
        }
      } catch {
        sessionStorage.removeItem(resultStorageKey);
      } finally {
        setLoaded(true);
      }
    }

    load();
  }, []);

  useEffect(() => {
    const onQueued = (event: Event) => {
      const jobId = (event as CustomEvent<{ jobId?: string }>).detail?.jobId;
      if (jobId) setDeepDiveJobId(jobId);
    };
    window.addEventListener("realneed:deep-dive-queued", onQueued);
    return () => window.removeEventListener("realneed:deep-dive-queued", onQueued);
  }, []);

  useEffect(() => {
    if (!deepDiveJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(deepDiveJobId ?? "")}`, { cache: "no-store" });
        const payload = (await response.json()) as { job?: { status?: string; lastErrorMessage?: string }; events?: Array<{ payload?: { type?: string; reportUrl?: string; message?: string } }> };
        const ready = payload.events?.find((event) => event.payload?.type === "deep_dive_ready" && event.payload.reportUrl);
        if (ready?.payload?.reportUrl) {
          if (!cancelled) { setDeepDiveUrl(ready.payload.reportUrl); setDeepDiveMessage("Deep Dive 已生成，私有链接只会显示在当前会话。") }
          return;
        }
        if (payload.job?.status === "WAITING_FOR_CREDENTIAL") {
          if (!cancelled) setDeepDiveMessage(payload.job.lastErrorMessage ?? "你的 API 连接需要更新后才能继续。已完成步骤会保留。");
          return;
        }
        if (payload.job?.status === "FAILED" || payload.job?.status === "CANCELLED") {
          if (!cancelled) setDeepDiveMessage(payload.job.lastErrorMessage ?? "报告任务没有完成。系统没有生成替代报告。");
          return;
        }
        timer = setTimeout(poll, 1400);
      } catch {
        timer = setTimeout(poll, 1800);
      }
    }
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [deepDiveJobId]);

  if (!loaded) return <main className="min-h-screen bg-paper" />;

  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-4 py-10">
        <EmptyState />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-graphite transition hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            重新输入
          </Link>
          <span className="inline-flex items-center gap-2 text-sm text-helper">
            <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-ink text-paper">
              <RealNeedLogo className="h-5 w-5" />
            </span>
            Idea judgment
          </span>
        </div>
      </header>

      {data.judgmentId && data.recoveryUrl ? (
        <ReportRecoveryControls
          reportId={data.judgmentId}
          recoveryUrl={data.recoveryUrl}
          onDeleted={() => {
            setData(null);
            window.history.replaceState(null, "", "/?deleted=1");
          }}
        />
      ) : null}
      {deepDiveMessage ? <section className="mx-auto max-w-[1120px] px-4 pt-5 sm:px-6"><div className="rounded-[8px] border border-line bg-white p-4 text-sm text-graphite shadow-paper">{deepDiveMessage}{deepDiveUrl ? <a className="ml-3 font-semibold text-ink underline underline-offset-4" href={deepDiveUrl}>打开私有报告</a> : null}</div></section> : null}
      <JudgmentReport judgment={data} onGenerateFreeReport={() => data.deepDiveOffer?.canGenerate && setDeepDiveOpen(true)} />
      <FreeDeepDiveModal open={deepDiveOpen} onOpenChange={setDeepDiveOpen} judgmentId={data.judgmentId} mode={data.deepDiveOffer?.mode} />
    </main>
  );
}
