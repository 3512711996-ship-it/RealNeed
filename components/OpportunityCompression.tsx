"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Scissors } from "lucide-react";
import type { IdeaJudgment, Opportunity, ScannedSource } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";

export function OpportunityCompression({
  judgment,
  onGenerateFreeReport
}: {
  judgment: IdeaJudgment;
  onGenerateFreeReport: () => void;
}) {
  if (judgment.opportunities.length === 0) {
    return (
      <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6">
        <div className="rounded-[10px] border border-line bg-white p-6 shadow-paper">
          <p className="text-sm font-semibold text-helper">Opportunity Compression</p>
          <h2 className="mt-1 text-3xl font-semibold leading-tight text-ink">这次不直接推荐产品方向</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-graphite">
            当前信号不足以支持“马上做 MVP”。RealNeed 仍然给出今天行动，但不会硬生成机会报告。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="border-y border-line bg-paper2 py-8 sm:py-12">
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-helper">Opportunity Compression</p>
            <h2 className="mt-1 text-[30px] font-semibold leading-tight text-ink sm:text-[38px]">把原始想法压缩成可做的小 MVP</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-helper">
              下面不是完整产品路线图，只是基于当前证据能先验证的小交付。
            </p>
          </div>
          <button type="button" onClick={onGenerateFreeReport} data-cursor="view" data-cursor-magnetic="true" className={buttonVariants({ variant: "outline", size: "sm" })}>
            查看 Deep Dive
          </button>
        </div>

        <div className="grid gap-5">
          {judgment.opportunities.map((opportunity, index) => (
            <motion.div
              key={opportunity.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08, duration: 0.3 }}
            >
              <OpportunityCard opportunity={opportunity} sources={judgment.accessibleSources} rank={index + 1} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function OpportunityCard({ opportunity, sources, rank }: { opportunity: Opportunity; sources: ScannedSource[]; rank: number }) {
  const relatedSources = sources.filter((source) => opportunity.sourceIds.includes(source.id));

  return (
    <article className="rounded-[10px] border border-line bg-white p-5 shadow-paper transition hover:-translate-y-0.5 hover:border-ink/25 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-helper">Opportunity {String(rank).padStart(2, "0")}</p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">{opportunity.productName}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-graphite">{opportunity.oneSentence}</p>
        </div>
        <div className="rounded-[8px] border border-line bg-paper px-4 py-3 text-center">
          <p className="text-xs text-helper">Score</p>
          <p className="font-mono text-3xl font-semibold text-ink">{opportunity.score}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Field label="适合谁" value={opportunity.targetUser} />
        <Field label="真实痛点" value={opportunity.painPoint} />
        <Field label="从原想法怎么压缩" value={opportunity.compressedFromOriginalIdea} />
        <Field label="MVP 只做什么" value={opportunity.mvpOnly} />
        <Field label="第一步验证动作" value={opportunity.firstValidationAction} />
        <Field label="中国环境怎么收费" value={opportunity.monetization} />
        <Field label="中国适配" value={opportunity.chinaFit} />
        <Field label="最大风险" value={opportunity.biggestRisk} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ListBlock icon={<Scissors className="h-4 w-4" />} title="暂时不要做" items={opportunity.doNotBuildYet} />
        <ListBlock icon={<CheckCircle2 className="h-4 w-4" />} title="前三天构建计划" items={opportunity.firstThreeDaysBuildPlan} />
      </div>

      <div className="mt-5 rounded-[8px] border border-line bg-paper p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <AlertTriangle className="h-4 w-4" />
          关联证据
        </div>
        {relatedSources.length ? (
          <div className="flex flex-wrap gap-2">
            {relatedSources.map((source) => (
              <span key={source.id} className="rounded-[6px] border border-line bg-white px-2.5 py-1 text-xs text-helper">
                {source.id} · {source.signalStrength ?? "weak"} · {source.platform}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-helper">这条机会没有可展示来源，已被系统过滤。</p>
        )}
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-helper">{label}</p>
      <p className="mt-1 text-sm leading-6 text-graphite">{value}</p>
    </div>
  );
}

function ListBlock({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  return (
    <div className="rounded-[8px] border border-line bg-paper p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        {icon}
        {title}
      </div>
      <ul className="grid gap-2 text-sm leading-6 text-helper">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
