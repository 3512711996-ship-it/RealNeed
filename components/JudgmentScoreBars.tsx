"use client";

import { motion } from "framer-motion";
import type { IdeaJudgment, JudgmentScore } from "@/lib/types";

const scoreItems: { key: keyof JudgmentScore; label: string; hint: string }[] = [
  { key: "demandSignal", label: "需求信号", hint: "用户是否真的表达了痛点" },
  { key: "paymentSignal", label: "付费信号", hint: "是否看到省钱、省时间、业务场景" },
  { key: "beginnerFeasibility", label: "新手可做", hint: "是否适合 Cursor / Codex / ChatGPT 新手" },
  { key: "mvpSimplicity", label: "MVP 简单度", hint: "能不能砍到 1-3 天可交付" },
  { key: "distributionAccess", label: "获客入口", hint: "能不能找到第一批用户" }
];

export function JudgmentScoreBars({ judgment }: { judgment: IdeaJudgment }) {
  const scores = judgment.scores;
  const canShowScore = judgment.canShowOverallScore !== false && judgment.confidence !== "VERY_LOW" && judgment.confidence !== "LOW";

  return (
    <section className="mx-auto max-w-[1120px] px-4 pb-8 sm:px-6">
      <div className="rounded-[10px] border border-line bg-white p-4 shadow-paper sm:p-5">
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-helper">Score Bars</p>
            <h2 className="text-2xl font-semibold text-ink">判断分数</h2>
          </div>
          <span className="rounded-[6px] border border-line bg-paper px-2.5 py-1 text-xs text-helper">
            {canShowScore ? "分数是判断参考，不是承诺结果" : "证据不足时隐藏精确分数"}
          </span>
        </div>
        <div className="grid gap-4">
          {scoreItems.map((item, index) => {
            const value = scores[item.key];
            return (
              <div key={item.key} className="grid gap-2 sm:grid-cols-[160px_1fr_54px] sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-ink">{item.label}</p>
                  <p className="text-xs leading-5 text-helper">{item.hint}</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full border border-line bg-paper">
                  <motion.div
                    className="h-full rounded-full bg-lime"
                    initial={{ width: 0 }}
                    animate={{ width: `${canShowScore ? value : 18}%` }}
                    transition={{ duration: 0.65, delay: index * 0.07, ease: "easeOut" }}
                  />
                </div>
                <span className="font-mono text-sm font-semibold text-ink">{canShowScore ? `${value}/100` : "待补证"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
