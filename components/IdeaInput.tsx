"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileQuestion, SearchCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiExecutionSelector, ResumeCredentialNotice, type ClientExecutionSelection } from "@/components/ApiExecutionSelector";
import { ClarificationForm, type ClarificationAnswers } from "@/components/ClarificationForm";
import { ErrorState } from "@/components/ErrorState";
import { initialScanProgress, JudgmentConsole, type ScanProgress } from "@/components/JudgmentConsole";
import { ManualPasteBox } from "@/components/ManualPasteBox";
import { ModeToggle } from "@/components/ModeToggle";
import type { AnalyzeMode, ClarificationResponse, IdeaJudgment } from "@/lib/types";

export const resultStorageKey = "realneed:last-judgment";

type StreamEvent =
  | { type: "stage"; stage: string; message: string }
  | { type: "queries_generated"; queryCount: number; queries: string[] }
  | { type: "sources_found"; candidateCount: number }
  | {
      type: "source_verified";
      checkedCount: number;
      completedCount: number;
      totalCount: number;
      candidateCount: number;
      deduplicatedCount: number;
      accessibleCount: number;
      blockedCount: number;
      rateLimitedCount: number;
      notFoundCount: number;
      timeoutCount: number;
      networkErrorCount: number;
      unsupportedContentCount: number;
      invalidUrlCount: number;
      unverifiedCount: number;
      cacheHitCount: number;
      networkRequestCount: number;
    }
  | { type: "signal_classified"; classifiedCount: number; strongCount: number; mediumCount: number; weakCount: number; irrelevantCount: number }
  | { type: "opportunities_generated"; opportunityCount: number }
  | { type: "report_saved"; judgmentId: string; reportCode: string }
  | { type: "needs_clarification"; questions: ClarificationResponse["questions"] }
  | { type: "completed"; result: IdeaJudgment }
  | { type: "error"; stage: string; message: string };

type QueuedJudgmentResponse =
  | {
      status: "queued";
      judgmentId: string;
      reportCode: string;
      recoveryUrl: string;
      jobId: string;
    }
  | ClarificationResponse
  | { status: "error"; message: string };

type JobPollPayload = {
  job: { status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "WAITING_FOR_CREDENTIAL"; lastErrorMessage?: string };
  events: { sequence: number; payload: StreamEvent }[];
};

export function IdeaInput() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [mode, setMode] = useState<AnalyzeMode>("auto_search");
  const [pastedContent, setPastedContent] = useState("");
  const [clarification, setClarification] = useState<ClarificationResponse | null>(null);
  const [answers, setAnswers] = useState<ClarificationAnswers>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ScanProgress>(initialScanProgress);
  const [error, setError] = useState("");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [execution, setExecution] = useState<ClientExecutionSelection | undefined>(undefined);
  const [waitingJob, setWaitingJob] = useState<{ jobId: string; judgmentId: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "manual_paste") {
      setMode("manual_paste");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setWaitingJob(null);

    if (!csrfToken) {
      setError("API 会话还没有准备好，请稍等几秒或刷新页面后重试。");
      return;
    }

    if (idea.trim().length < 5) {
      setError("这个想法太短了，请再说清楚一点，至少 5 个字。");
      return;
    }

    if (mode === "manual_paste" && pastedContent.trim().length < 100) {
      setError("手动粘贴模式下，请至少粘贴 100 字真实帖子、评论或用户反馈。");
      return;
    }

    setLoading(true);
    setProgress({ ...initialScanProgress, stage: "clarification", message: "正在判断输入是否太泛" });

    try {
      const response = await fetch("/api/judgments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({
          idea,
          mode,
          pastedContent: mode === "manual_paste" ? pastedContent : undefined,
          clarificationAnswers: hasAnswers(answers) ? answers : undefined,
          market: "china",
          userLevel: "vibe_coding_beginner",
          execution
        })
      });

      const queued = (await response.json()) as QueuedJudgmentResponse;

      if (!response.ok || ("status" in queued && queued.status === "error")) {
        throw new Error("message" in queued ? queued.message : "判断服务暂时不可用，本次没有生成判断结果。");
      }

      if ("status" in queued && queued.status === "needs_clarification") {
        setClarification(queued);
        setProgress((current) => ({ ...current, stage: "clarification", message: "这个想法还需要澄清" }));
        return;
      }

      if (!("jobId" in queued)) {
        throw new Error("判断服务没有返回后台任务。");
      }

      sessionStorage.setItem("realneed:last-recovery-url", queued.recoveryUrl);
      sessionStorage.setItem(`realneed:recovery:${queued.judgmentId}`, queued.recoveryUrl);
      setProgress((current) => ({ ...current, stage: "queued", message: `扫描任务已保存：${queued.reportCode}` }));
      await pollJobUntilDone(queued.jobId, queued.judgmentId);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "判断失败，请稍后重试。";
      setError(message);
      setProgress((current) => ({ ...current, failedStage: current.stage, message }));
    } finally {
      setLoading(false);
    }
  }

  async function pollJobUntilDone(jobId: string, judgmentId: string) {
    let after = 0;
    let progressReadFailures = 0;

    for (let attempt = 0; attempt < 180; attempt += 1) {
      const payload = await readJobProgress(jobId, judgmentId, after, progressReadFailures);
      if (!payload) {
        progressReadFailures += 1;
        setProgress((current) => ({
          ...current,
          message: `后台进度暂时不可读，正在重试 ${progressReadFailures}/10。`
        }));
        await new Promise((resolve) => setTimeout(resolve, Math.min(3000, 900 + progressReadFailures * 300)));
        continue;
      }
      progressReadFailures = 0;

      for (const event of payload.events) {
        after = Math.max(after, event.sequence);
        handleStreamEvent(event.payload);
      }

      if (payload.job.status === "SUCCEEDED") {
        const result = await fetchJudgment(judgmentId);
        sessionStorage.setItem(resultStorageKey, JSON.stringify(result));
        router.push(`/results?judgmentId=${encodeURIComponent(judgmentId)}`);
        return;
      }

      if (payload.job.status === "WAITING_FOR_CREDENTIAL") {
        setWaitingJob({ jobId, judgmentId });
        const message = payload.job.lastErrorMessage || "任务已暂停：你的 API 连接需要更新。系统没有切换到平台 API。";
        setProgress((current) => ({ ...current, failedStage: "waiting_for_credential", message }));
        throw new Error(message);
      }

      if (payload.job.status === "FAILED" || payload.job.status === "CANCELLED") {
        throw new Error(payload.job.lastErrorMessage || "扫描失败，本次没有生成判断结果。");
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    throw new Error("扫描仍在后台运行，请稍后使用恢复链接查看结果。");
  }

  async function readJobProgress(jobId: string, judgmentId: string, after: number, failureCount: number): Promise<JobPollPayload | null> {
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}?after=${after}`, { cache: "no-store" });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        const recovered = await openFinishedReportIfAvailable(judgmentId);
        if (recovered) return { job: { status: "SUCCEEDED" }, events: [] };
        if (isRetryableProgressStatus(response.status) && failureCount < 10) return null;
        throw new Error(message || `后台进度接口返回 ${response.status}，本次没有生成 fallback 结果。`);
      }

      return (await response.json()) as JobPollPayload;
    } catch (pollError) {
      const recovered = await openFinishedReportIfAvailable(judgmentId);
      if (recovered) return { job: { status: "SUCCEEDED" }, events: [] };
      if (failureCount < 10) return null;
      const message = pollError instanceof Error ? pollError.message : "无法读取后台扫描进度。";
      throw new Error(`${message} 本次没有生成 fallback 结果。`);
    }
  }

  async function openFinishedReportIfAvailable(judgmentId: string) {
    try {
      const result = await fetchJudgment(judgmentId);
      if (!isJudgmentReady(result)) return false;
      sessionStorage.setItem(resultStorageKey, JSON.stringify(result));
      router.push(`/results?judgmentId=${encodeURIComponent(judgmentId)}`);
      return true;
    } catch {
      return false;
    }
  }

  async function fetchJudgment(judgmentId: string) {
    const response = await fetch(`/api/judgments/${encodeURIComponent(judgmentId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("扫描完成，但读取判断报告失败。");
    const payload = (await response.json()) as { judgment: IdeaJudgment };
    return { ...payload.judgment, judgmentId };
  }

  async function readErrorMessage(response: Response) {
    try {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as { message?: string; error?: string };
        return payload.message ?? payload.error ?? "";
      }
      return (await response.text()).slice(0, 240);
    } catch {
      return "";
    }
  }

  function isRetryableProgressStatus(status: number) {
    return status === 404 || status === 408 || status === 429 || status >= 500;
  }

  function isJudgmentReady(result: IdeaJudgment) {
    return Array.isArray(result.searchQueries) && Array.isArray(result.scannedSources) && Boolean(result.todayAction);
  }

  async function resumeWaitingJob() {
    if (!waitingJob || !csrfToken) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(waitingJob.jobId)}/resume-with-credential`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ execution: execution ?? platformExecution() })
      });
      if (!response.ok) {
        const message = await readErrorMessage(response);
        throw new Error(message || "任务恢复失败，请检查 API 连接后重试。");
      }
      setProgress((current) => ({ ...current, stage: "queued", message: "API 连接已更新，任务已重新进入队列。" }));
      await pollJobUntilDone(waitingJob.jobId, waitingJob.judgmentId);
    } catch (resumeError) {
      const message = resumeError instanceof Error ? resumeError.message : "任务恢复失败。";
      setError(message);
      setProgress((current) => ({ ...current, failedStage: "waiting_for_credential", message }));
    } finally {
      setLoading(false);
    }
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.type === "stage") {
      setProgress((current) => ({ ...current, stage: event.stage, message: event.message }));
      return;
    }

    if (event.type === "needs_clarification") {
      setClarification({ status: "needs_clarification", questions: event.questions });
      setProgress((current) => ({ ...current, stage: "clarification", message: "这个想法还需要澄清" }));
      return;
    }

    if (event.type === "queries_generated") {
      setProgress((current) => ({ ...current, queryCount: event.queryCount }));
      return;
    }

    if (event.type === "sources_found") {
      setProgress((current) => ({ ...current, candidateCount: event.candidateCount }));
      return;
    }

    if (event.type === "source_verified") {
      const unavailable =
        event.blockedCount +
        event.rateLimitedCount +
        event.notFoundCount +
        event.timeoutCount +
        event.networkErrorCount +
        event.unsupportedContentCount +
        event.invalidUrlCount;

      setProgress((current) => ({
        ...current,
        stage: "source_verification",
        message: `已完成 ${event.completedCount}/${event.totalCount} 个来源验证`,
        candidateCount: event.candidateCount,
        deduplicatedCount: event.deduplicatedCount,
        checkedCount: event.checkedCount,
        totalCount: event.totalCount,
        accessibleCount: event.accessibleCount,
        inaccessibleCount: unavailable,
        blockedCount: event.blockedCount,
        rateLimitedCount: event.rateLimitedCount,
        notFoundCount: event.notFoundCount,
        timeoutCount: event.timeoutCount,
        networkErrorCount: event.networkErrorCount,
        unsupportedContentCount: event.unsupportedContentCount,
        invalidUrlCount: event.invalidUrlCount,
        unverifiedCount: event.unverifiedCount,
        cacheHitCount: event.cacheHitCount,
        networkRequestCount: event.networkRequestCount
      }));
      return;
    }

    if (event.type === "signal_classified") {
      setProgress((current) => ({
        ...current,
        classifiedCount: event.classifiedCount,
        strongCount: event.strongCount,
        mediumCount: event.mediumCount,
        weakCount: event.weakCount,
        irrelevantCount: event.irrelevantCount
      }));
      return;
    }

    if (event.type === "opportunities_generated") {
      setProgress((current) => ({ ...current, opportunityCount: event.opportunityCount }));
      return;
    }

    if (event.type === "report_saved") {
      setProgress((current) => ({ ...current, stage: "saving", message: `判断报告已保存：${event.reportCode}` }));
      return;
    }

    if (event.type === "error") {
      setError(event.message);
      setProgress((current) => ({ ...current, failedStage: event.stage, message: event.message }));
      return;
    }

    if (event.type === "completed") {
      if (event.result) {
        sessionStorage.setItem(resultStorageKey, JSON.stringify(event.result));
        router.push("/results");
      }
    }
  }

  const submitText = clarification ? "带着补充信息重新判断" : "开始判断";

  return (
    <form onSubmit={handleSubmit} className="rounded-[10px] border border-ink/10 bg-white p-4 shadow-soft sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-[6px] border border-line bg-paper px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-helper">
            <FileQuestion className="h-3.5 w-3.5 text-ink" />
            Idea Judgment
          </div>
          <h3 className="text-2xl font-semibold text-ink">输入你的产品想法</h3>
        </div>
        <span className="hidden rounded-[6px] border border-line bg-paper px-2.5 py-1 text-xs text-helper sm:inline">fail-closed</span>
      </div>

      <Textarea
        id="idea"
        value={idea}
        maxLength={500}
        onChange={(event) => {
          setIdea(event.target.value);
          setClarification(null);
          setAnswers({});
        }}
        placeholder="比如：我想做一个 AI 记账工具"
        className="min-h-[168px] rounded-[8px] border-ink/10 bg-paper/70 text-[16px] shadow-none focus:border-ink/45 focus:ring-4 focus:ring-lime/25"
      />

      {clarification ? <ClarificationForm questions={clarification.questions} answers={answers} onChange={setAnswers} /> : null}
      {mode === "manual_paste" ? <ManualPasteBox value={pastedContent} onChange={setPastedContent} /> : null}

      <div className="mt-4">
        <ApiExecutionSelector disabled={loading} requireSearchCredential={mode === "auto_search"} onSessionReady={setCsrfToken} onExecutionChange={setExecution} />
      </div>

      <div className="mt-4 grid gap-3 border-t border-line pt-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <ModeToggle mode={mode} onChange={setMode} />
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-helper">
            <span>
              {mode === "auto_search"
                ? "自动搜索会先验证 URL，再判断需求信号。"
                : "手动内容会标注为用户粘贴，未进行外部网页验证。"}
            </span>
            <span>{idea.trim().length} / 500</span>
          </div>
        </div>
        <Button type="submit" size="lg" variant="accent" disabled={loading} data-cursor="scan" data-cursor-magnetic="true" className="min-w-[170px] shadow-none transition hover:-translate-y-0.5">
          {loading ? <SearchCheck className="h-4 w-4 animate-pulse" /> : <ArrowRight className="h-4 w-4" />}
          {submitText}
        </Button>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorState message={error} />
        </div>
      ) : null}

      {waitingJob ? (
        <div className="mt-4">
          <ResumeCredentialNotice onRetry={resumeWaitingJob} />
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4">
          <JudgmentConsole progress={progress} />
        </div>
      ) : null}
    </form>
  );
}

function hasAnswers(answers: ClarificationAnswers) {
  return Boolean(answers.targetUser?.trim() || answers.painfulScene?.trim() || answers.productForm?.trim());
}

function platformExecution(): ClientExecutionSelection {
  return {
    search: { credentialSource: "PLATFORM", provider: "TAVILY", credentialId: null, configurationVersion: 1 },
    generation: { credentialSource: "PLATFORM", provider: "MOONSHOT", model: "kimi-k2.5", credentialId: null, configurationVersion: 1 }
  };
}
