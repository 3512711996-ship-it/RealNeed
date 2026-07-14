"use client";

import { FileCheck2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { DeepDiveEligibility, DeepDiveMode, ReportGenerationEligibility } from "@/lib/types";

const evidenceModules = [
  "最值得先验证的 1 个方向",
  "1-3 天 MVP 方案",
  "暂时不要做的功能清单",
  "第一批用户搜索地图",
  "评论、私信和跟进话术",
  "真实收费测试方案",
  "今天立刻执行的动作",
  "3 天验证计划",
  "风险和停止条件",
  "可直接复制给 Codex 的开发提示词"
];

const repairModules = [
  "证据缺口地图",
  "想法重构假设",
  "Reddit / 知乎 / 小红书搜索计划",
  "第一批用户访谈问题",
  "手动交付测试",
  "预售收费话术",
  "3 天补证计划",
  "继续 / 停止 / 换方向规则",
  "可直接复制给 Codex 的验证提示词"
];

export function DeepDiveLocked({
  mode,
  offer,
  generationEligibility,
  onOpen
}: {
  mode: DeepDiveMode;
  offer?: DeepDiveEligibility;
  generationEligibility?: ReportGenerationEligibility;
  onOpen: () => void;
}) {
  const isRepair = mode === "IDEA_SIGNAL_REPAIR";
  const lockedModules = isRepair ? repairModules : evidenceModules;

  return (
    <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="grid gap-5 rounded-[10px] border border-ink bg-ink p-5 text-paper shadow-soft lg:grid-cols-[0.78fr_1fr] lg:items-center" data-cursor-theme="dark">
        <div>
          <div className="mb-4 grid h-11 w-11 place-items-center rounded-[8px] border border-paper/20 bg-paper/10">
            <FileCheck2 className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-lime">Free BYOK Deep Dive</p>
          <h2 className="mt-2 text-3xl font-semibold">{isRepair ? "先补足真实需求信号" : "把这个机会继续拆下去"}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-paper/68">
            {isRepair
              ? "本次证据不足，所以不会硬生成方向。免费的补足报告会基于你的生成模型 API，整理证据缺口、搜索计划、访谈问题和 3 天低成本补证动作。"
              : "本次已有可用证据。免费的执行报告会基于你的生成模型 API，继续拆 MVP、第一批用户地图和冷启动话术。"}
          </p>
          {offer ? (
            <div className="mt-4 grid gap-2 text-xs leading-5 text-paper/58 sm:grid-cols-3">
              <span>可分析正文 {offer.evidenceStats.confirmedContentCount}</span>
              <span>独立证据 {offer.evidenceStats.independentEvidenceCount}</span>
              <span>强/中信号 {offer.evidenceStats.strongOrMediumCount}</span>
            </div>
          ) : null}
          {generationEligibility && !generationEligibility.eligible ? <p className="mt-3 text-xs leading-5 text-straw">{generationEligibility.reason}</p> : null}
          <p className="mt-3 text-xs leading-5 text-paper/48">RealNeed 免费开源。报告直接生成私有链接，不需要付款或管理员确认。</p>
        </div>
        <div>
          <div className="grid gap-2 sm:grid-cols-2">
            {lockedModules.map((item) => (
              <div key={item} className="rounded-[8px] border border-paper/14 bg-paper/8 px-3 py-2 text-sm text-paper/78">
                {item}
              </div>
            ))}
          </div>
          <button type="button" onClick={onOpen} data-cursor="view" data-cursor-magnetic="true" className={buttonVariants({ variant: "accent", className: "mt-5" })}>
            免费生成{isRepair ? "想法补足报告" : "执行型报告"}
          </button>
        </div>
      </div>
    </section>
  );
}
