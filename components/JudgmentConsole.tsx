"use client";

import { Check, CircleDot, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScanProgress = {
  stage: string;
  message: string;
  failedStage?: string | null;
  queryCount: number | null;
  candidateCount: number | null;
  deduplicatedCount: number | null;
  checkedCount: number | null;
  totalCount: number | null;
  accessibleCount: number | null;
  inaccessibleCount: number | null;
  blockedCount: number | null;
  rateLimitedCount: number | null;
  notFoundCount: number | null;
  timeoutCount: number | null;
  networkErrorCount: number | null;
  unsupportedContentCount: number | null;
  invalidUrlCount: number | null;
  unverifiedCount: number | null;
  cacheHitCount: number | null;
  networkRequestCount: number | null;
  classifiedCount: number | null;
  strongCount: number | null;
  mediumCount: number | null;
  weakCount: number | null;
  irrelevantCount: number | null;
  opportunityCount: number | null;
};

export const initialScanProgress: ScanProgress = {
  stage: "idle",
  message: "等待开始",
  failedStage: null,
  queryCount: null,
  candidateCount: null,
  deduplicatedCount: null,
  checkedCount: null,
  totalCount: null,
  accessibleCount: null,
  inaccessibleCount: null,
  blockedCount: null,
  rateLimitedCount: null,
  notFoundCount: null,
  timeoutCount: null,
  networkErrorCount: null,
  unsupportedContentCount: null,
  invalidUrlCount: null,
  unverifiedCount: null,
  cacheHitCount: null,
  networkRequestCount: null,
  classifiedCount: null,
  strongCount: null,
  mediumCount: null,
  weakCount: null,
  irrelevantCount: null,
  opportunityCount: null
};

const steps = [
  { stage: "interpreting", label: "正在理解你的想法" },
  { stage: "clarification", label: "正在判断输入是否太泛" },
  { stage: "query_generation", label: "正在生成需求搜索词" },
  { stage: "searching", label: "正在搜索公开网页" },
  { stage: "source_deduplication", label: "正在整理和去重来源" },
  { stage: "source_verification", label: "正在并行验证来源" },
  { stage: "signal_classification", label: "正在同步判断需求信号" },
  { stage: "scoring", label: "正在评估付费可能性" },
  { stage: "mvp_compression", label: "正在压缩 MVP" },
  { stage: "today_action", label: "正在生成今天行动" },
  { stage: "saving", label: "正在保存判断报告" }
];

export function JudgmentConsole({ progress }: { progress: ScanProgress }) {
  const activeIndex = steps.findIndex((step) => step.stage === progress.stage);
  const failed = Boolean(progress.failedStage);

  return (
    <div className="overflow-hidden rounded-[10px] border border-ink/10 bg-ink text-paper shadow-soft" aria-live="polite">
      <div className="flex flex-col gap-3 border-b border-paper/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lime">Judgment Console</p>
          <h2 className="mt-1 text-xl font-semibold">{progress.message}</h2>
        </div>
        <span className="rounded-[6px] border border-paper/14 bg-paper/8 px-2.5 py-1 text-xs text-paper/58">
          这里显示的是本次扫描的实时数据
        </span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_250px]">
        <div className="grid gap-2">
          {steps.map((step, index) => {
            const done = activeIndex > index;
            const active = activeIndex === index && !failed;
            const stepFailed = progress.failedStage === step.stage;

            return (
              <div
                key={step.stage}
                className={cn(
                  "grid grid-cols-[28px_1fr] items-center gap-3 rounded-[8px] border px-3 py-2.5 text-sm transition",
                  done && "border-lime/25 bg-lime/10 text-paper",
                  active && "border-lime/45 bg-paper/8 text-paper shadow-[0_0_0_3px_rgba(198,243,106,0.08)]",
                  stepFailed && "border-clay/40 bg-clay/15 text-paper",
                  !done && !active && !stepFailed && "border-paper/10 bg-paper/[0.035] text-paper/42"
                )}
              >
                <span className={cn("grid h-7 w-7 place-items-center rounded-[6px] border", done || active ? "border-lime/45 text-lime" : "border-paper/12 text-paper/35", stepFailed && "border-clay/45 text-clay")}>
                  {stepFailed ? <XCircle className="h-4 w-4" /> : done ? <Check className="h-4 w-4" /> : <CircleDot className="h-3.5 w-3.5" />}
                </span>
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>

        <div className="grid gap-2 rounded-[8px] border border-paper/10 bg-paper/[0.04] p-3">
          <Metric label="候选来源" value={formatValue(progress.candidateCount, "正在搜索...")} />
          <Metric label="去重后" value={formatValue(progress.deduplicatedCount, "等待去重")} />
          <Metric label="搜索词" value={formatValue(progress.queryCount, "正在生成...")} />
          <Metric label="已完成" value={formatVerified(progress)} />
          <Metric label="可访问" value={formatValue(progress.accessibleCount, "等待验证")} />
          <Metric label="被网站拦截" value={formatValue(progress.blockedCount, "等待验证")} />
          <Metric label="限流/429" value={formatValue(progress.rateLimitedCount, "等待验证")} />
          <Metric label="已失效" value={formatValue(progress.notFoundCount, "等待验证")} />
          <Metric label="超时" value={formatValue(progress.timeoutCount, "等待验证")} />
          <Metric label="网络错误" value={formatValue(progress.networkErrorCount, "等待验证")} />
          <Metric label="待验证" value={formatValue(progress.unverifiedCount, "等待验证")} />
          <Metric label="缓存/请求" value={formatCacheAndRequests(progress)} />
          <Metric label="强/中/弱/无关" value={formatSignals(progress)} />
          <Metric label="候选机会" value={formatValue(progress.opportunityCount, "等待判断")} />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[7px] border border-paper/10 bg-ink/35 px-3 py-2">
      <span className="text-xs text-paper/58">{label}</span>
      <span className="text-right font-mono text-sm font-semibold text-paper">{value}</span>
    </div>
  );
}

function formatValue(value: number | null, fallback: string) {
  return value === null ? fallback : String(value);
}

function formatVerified(progress: ScanProgress) {
  if (progress.checkedCount === null || progress.totalCount === null) return "等待验证";
  return `${progress.checkedCount} / ${progress.totalCount}`;
}

function formatCacheAndRequests(progress: ScanProgress) {
  if (progress.cacheHitCount === null && progress.networkRequestCount === null) return "等待验证";
  return `${progress.cacheHitCount ?? 0} / ${progress.networkRequestCount ?? 0}`;
}

function formatSignals(progress: ScanProgress) {
  const values = [progress.strongCount, progress.mediumCount, progress.weakCount, progress.irrelevantCount];
  if (values.some((value) => value === null)) return progress.classifiedCount === null ? "等待分类" : `已分类 ${progress.classifiedCount}`;
  return `${progress.strongCount}/${progress.mediumCount}/${progress.weakCount}/${progress.irrelevantCount}`;
}
