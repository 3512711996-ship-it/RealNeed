"use client";

import { ChevronDown, ExternalLink, ShieldCheck } from "lucide-react";
import type { ScannedSource, TodayAction } from "@/lib/types";

export function EvidenceBasisPanel({ action, sources }: { action: TodayAction; sources: ScannedSource[] }) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const linkedSources = action.evidenceSourceIds.map((id) => sourceById.get(id)).filter((source): source is ScannedSource => Boolean(source));
  const evidenceMode = action.mode === "EVIDENCE_BASED" ? "证据型" : "假设验证型";

  return (
    <details className="group rounded-[8px] border border-paper/14 bg-paper/[0.055] p-4">
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold"
        data-cursor="evidence"
        data-cursor-magnetic="true"
      >
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-lime" />
          行动依据
        </span>
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>

      <div className="mt-4 grid gap-4 text-sm leading-6 text-paper/72">
        <div className="grid gap-2 sm:grid-cols-2">
          <BasisItem label="当前模式" value={evidenceMode} />
          <BasisItem label="已确认真实内容" value={`${action.evidenceSummary.confirmedContentCount} 条`} />
          <BasisItem label="独立有效证据" value={`${action.evidenceSummary.independentEvidenceCount} 组`} />
          <BasisItem label="判断置信度" value={confidenceText(action.evidenceSummary.confidence)} />
        </div>

        {action.mode === "HYPOTHESIS_VALIDATION" ? (
          <div className="rounded-[7px] border border-paper/14 bg-ink/40 p-3 text-paper/78">本模块没有把搜索线索当成需求证据。</div>
        ) : null}

        <ReasonBlock title="为什么建议执行当前任务" items={action.evidenceSummary.reasoning} />
        <ReasonBlock title="为什么使用当前成功指标" items={[action.successMetric.reasoning]} />
        <ReasonBlock title="为什么设置当前停止条件" items={[action.stopCondition.reasoning]} />

        {linkedSources.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.13em] text-paper/50">使用来源</p>
            <div className="grid gap-2">
              {linkedSources.map((source) =>
                source.url ? (
                  <a
                    key={source.id}
                    href={source.finalUrl || source.url}
                    target="_blank"
                    rel="noreferrer"
                    data-cursor="open"
                    data-cursor-magnetic="true"
                    className="inline-flex items-center justify-between gap-3 rounded-[7px] border border-paper/14 bg-paper/8 px-3 py-2 text-paper/82 transition hover:border-lime/50 hover:text-paper"
                  >
                    <span className="line-clamp-1">{source.title}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <div key={source.id} className="rounded-[7px] border border-paper/14 bg-paper/8 px-3 py-2">
                    {source.title}
                  </div>
                )
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.13em] text-paper/50">来源标题</p>
            <div className="flex flex-wrap gap-2">
              {action.evidenceSummary.sourceTitles.length ? (
                action.evidenceSummary.sourceTitles.map((title) => (
                  <span key={title} className="rounded-[6px] border border-paper/14 bg-paper/8 px-2.5 py-1 text-xs text-paper/70">
                    {title}
                  </span>
                ))
              ) : (
                <span className="text-paper/54">暂无可作为正式依据的来源。</span>
              )}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function BasisItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[7px] border border-paper/14 bg-paper/8 p-3">
      <p className="text-xs text-paper/46">{label}</p>
      <p className="mt-1 font-semibold text-paper">{value}</p>
    </div>
  );
}

function ReasonBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.13em] text-paper/50">{title}</p>
      <ul className="grid gap-1">
        {items.map((item) => (
          <li key={item} className="rounded-[7px] border border-paper/14 bg-paper/8 px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function confidenceText(confidence: TodayAction["evidenceSummary"]["confidence"]) {
  if (confidence === "HIGH") return "高";
  if (confidence === "MEDIUM") return "中";
  if (confidence === "LOW") return "低";
  return "很低";
}
