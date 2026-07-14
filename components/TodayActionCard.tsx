"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Check, Clipboard, MessageSquareText, Search, Target, XCircle } from "lucide-react";
import { EvidenceBasisPanel } from "@/components/EvidenceBasisPanel";
import { Button } from "@/components/ui/button";
import { recordAnalyticsEvent } from "@/lib/analytics";
import type { ScannedSource, TodayAction } from "@/lib/types";

type LegacyTodayAction = {
  title?: string;
  description?: string;
  searchKeywords?: string[];
  outreachMessage?: string;
  successMetric?: string;
  stopCondition?: string;
};

export function TodayActionCard({
  action,
  sources,
  judgmentId
}: {
  action: TodayAction | LegacyTodayAction;
  sources: ScannedSource[];
  judgmentId?: string;
}) {
  const normalizedAction = normalizeTodayAction(action, sources);
  const [done, setDone] = useState(false);
  const isEvidenceBased = normalizedAction.mode === "EVIDENCE_BASED";

  function markDone() {
    setDone(true);
    recordAnalyticsEvent({
      eventType: "today_action_completed",
      judgmentId,
      properties: {
        mode: normalizedAction.mode,
        evidenceSourceCount: normalizedAction.evidenceSourceIds.length
      }
    });
    window.setTimeout(() => setDone(false), 1800);
  }

  return (
    <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6">
      <div className="rounded-[10px] border border-ink bg-ink p-5 text-paper shadow-soft sm:p-6" data-cursor-theme="dark">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-lime">{isEvidenceBased ? "Today Action" : "Hypothesis Test"}</p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight">{normalizedAction.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-paper/70">{normalizedAction.description}</p>
          </div>
          <div className="shrink-0 rounded-[8px] border border-paper/14 bg-paper/8 px-3 py-2 text-xs leading-5 text-paper/72">
            <p>证据模式：{isEvidenceBased ? "证据型" : "假设验证"}</p>
            <p>已确认真实内容：{normalizedAction.evidenceSummary.confirmedContentCount} 条</p>
            <p>独立有效证据：{normalizedAction.evidenceSummary.independentEvidenceCount} 组</p>
            <p>判断置信度：{confidenceText(normalizedAction.evidenceSummary.confidence)}</p>
          </div>
        </div>

        {!isEvidenceBased ? (
          <div className="mt-5 rounded-[8px] border border-straw/40 bg-straw/10 p-4 text-sm leading-6 text-paper/78">
            当前真实证据不足，下面的行动用于获取证据，不代表 RealNeed 已经确认需求或付费意愿。
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[8px] border border-paper/12 bg-paper/[0.055] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Search className="h-4 w-4 text-lime" />
              第一批用户搜索词
            </div>
            <div className="flex flex-wrap gap-2">
              {normalizedAction.targetUserSearch.keywords.map((keyword) => (
                <CopyKeyword key={keyword} keyword={keyword} />
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-paper/52">{normalizedAction.targetUserSearch.whyTheseKeywords}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {normalizedAction.targetUserSearch.platforms.map((platform) => (
                <span key={platform} className="rounded-[6px] border border-paper/12 bg-paper/8 px-2.5 py-1 text-xs text-paper/62">
                  {platform}
                </span>
              ))}
            </div>
          </div>

          <Info icon={<Target className="h-4 w-4 text-lime" />} title="成功指标" text={normalizedAction.successMetric.metric} note={normalizedAction.successMetric.reasoning} />
          <Info icon={<XCircle className="h-4 w-4 text-lime" />} title="停止条件" text={normalizedAction.stopCondition.condition} note={normalizedAction.stopCondition.reasoning} />

          <div className="rounded-[8px] border border-paper/12 bg-paper/[0.055] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <MessageSquareText className="h-4 w-4 text-lime" />
              评论 / 私信话术
            </div>
            <div className="grid gap-3 text-sm leading-7 text-paper/72">
              <ScriptBlock label="公开评论" value={normalizedAction.outreachScript.publicComment} />
              <ScriptBlock label="私信" value={normalizedAction.outreachScript.directMessage} />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {normalizedAction.tasks.map((item, index) => (
            <div key={`${item.task}-${index}`} className="rounded-[8px] border border-paper/12 bg-paper/[0.055] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-paper/46">Task {String(index + 1).padStart(2, "0")}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-paper">{item.task}</p>
              <p className="mt-1 text-sm leading-6 text-paper/62">{item.purpose}</p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <EvidenceBasisPanel action={normalizedAction} sources={sources} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" variant="accent" onClick={markDone} data-cursor="action" data-cursor-magnetic="true">
            {done ? <Check className="h-4 w-4" /> : null}
            {done ? "已记录今天行动" : "我已执行今天行动"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function CopyKeyword({ keyword }: { keyword: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(keyword);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={copy}
      data-cursor="copy"
      data-cursor-magnetic="true"
      className="rounded-[6px] border border-paper/14 bg-paper/8 px-2.5 py-1 text-xs text-paper/72 transition hover:-translate-y-0.5 hover:border-lime/50 hover:text-paper"
    >
      {copied ? "已复制" : keyword}
    </button>
  );
}

function ScriptBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="rounded-[7px] border border-paper/12 bg-paper/8 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.13em] text-paper/46">{label}</span>
        <button type="button" onClick={copy} data-cursor="copy" data-cursor-magnetic="true" className="inline-flex items-center gap-1 text-xs font-semibold text-lime">
          <Clipboard className="h-3.5 w-3.5" />
          {copied ? "已复制" : "复制话术"}
        </button>
      </div>
      <p>{value || "未生成"}</p>
    </div>
  );
}

function Info({ icon, title, text, note }: { icon: ReactNode; title: string; text: string; note: string }) {
  return (
    <div className="rounded-[8px] border border-paper/12 bg-paper/[0.055] p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <p className="text-sm leading-7 text-paper/72">{text}</p>
      <p className="mt-2 text-xs leading-5 text-paper/46">{note}</p>
    </div>
  );
}

function normalizeTodayAction(action: TodayAction | LegacyTodayAction, sources: ScannedSource[]): TodayAction {
  if ("mode" in action && action.mode) return action as TodayAction;

  const legacy = action as LegacyTodayAction;
  return {
    mode: "HYPOTHESIS_VALIDATION",
    title: legacy.title ?? "基于假设的下一步验证",
    description:
      "这是旧版 Today Action 数据结构，无法证明它绑定了真实证据。页面已按假设验证显示，不把它当作证据型行动建议。",
    targetUserSearch: {
      keywords: legacy.searchKeywords ?? [],
      platforms: ["待人工确认"],
      whyTheseKeywords: "这些词来自旧版结果 JSON，缺少 evidenceSourceIds，不能证明是基于 Tavily 正文生成。"
    },
    tasks: [
      {
        task: legacy.description ?? "先人工验证是否有人承认这个问题。",
        purpose: "旧结构没有任务级证据绑定，只能作为假设验证。",
        evidenceSourceIds: []
      }
    ],
    successMetric: {
      metric: legacy.successMetric ?? "未生成",
      reasoning: "旧结构没有记录成功指标的来源。"
    },
    stopCondition: {
      condition: legacy.stopCondition ?? "未生成",
      reasoning: "旧结构没有记录停止条件的来源。"
    },
    outreachScript: {
      publicComment: legacy.outreachMessage ?? "",
      directMessage: legacy.outreachMessage ?? ""
    },
    evidenceSummary: {
      confirmedContentCount: sources.filter((source) => source.evidenceAvailability === "CONFIRMED_CONTENT" || source.origin === "USER_PASTED").length,
      independentEvidenceCount: 0,
      sourceTitles: [],
      reasoning: ["旧版 Today Action 没有 evidenceSourceIds，不能声明为证据型。"],
      confidence: "VERY_LOW"
    },
    evidenceSourceIds: []
  };
}

function confidenceText(confidence: TodayAction["evidenceSummary"]["confidence"]) {
  if (confidence === "HIGH") return "高";
  if (confidence === "MEDIUM") return "中";
  if (confidence === "LOW") return "低";
  return "很低";
}
