"use client";

import { motion } from "framer-motion";
import { BadgeCheck, FileQuestion, Filter, Radar, ScanLine } from "lucide-react";

const previewSteps = [
  {
    label: "idea detected",
    text: "我想做一个 AI 记账工具",
    icon: Radar
  },
  {
    label: "clarification check",
    text: "先确认目标用户、痛苦场景和第一版形态",
    icon: FileQuestion
  },
  {
    label: "signal scanning",
    text: '"I hate tracking expenses" / "any alternative to expense tracker"',
    icon: ScanLine
  },
  {
    label: "judgment compressed",
    text: "输出 verdict、分数、可做 MVP 和今天行动",
    icon: Filter
  }
];

export function LiveScanPreview() {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.12 }}
      className="relative overflow-hidden rounded-[10px] border border-ink/10 bg-ink text-paper shadow-soft"
      aria-label="Live Preview"
    >
      <div className="absolute inset-0 scan-grid opacity-[0.18]" />
      <div className="absolute right-5 top-5 h-28 w-28 rounded-full border border-lime/20" />
      <div className="absolute right-12 top-12 h-14 w-14 rounded-full border border-lime/35" />

      <div className="relative border-b border-paper/10 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-paper/48">Preview</p>
            <h2 className="mt-1 text-2xl font-semibold">Live Judgment Preview</h2>
          </div>
          <span className="inline-flex items-center gap-1 rounded-[6px] border border-lime/35 bg-lime/15 px-2.5 py-1 text-xs font-semibold text-lime">
            <BadgeCheck className="h-3.5 w-3.5" />
            visual only
          </span>
        </div>
        <p className="mt-3 max-w-sm text-sm leading-6 text-paper/62">
          这是判断过程预览，不是真实搜索结果，也不会作为 evidence 展示。
        </p>
      </div>

      <div className="relative grid gap-3 p-4 sm:p-5">
        {previewSteps.map((step, index) => {
          const Icon = step.icon;

          return (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.25 + index * 0.12 }}
              className="grid grid-cols-[34px_1fr] gap-3 rounded-[8px] border border-paper/10 bg-paper/[0.055] p-3"
            >
              <span className="grid h-8 w-8 place-items-center rounded-[6px] border border-lime/25 bg-lime/12 text-lime">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold uppercase tracking-[0.13em] text-paper/44">{step.label}</span>
                <span className="mt-1 block text-sm leading-6 text-paper/82">{step.text}</span>
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.aside>
  );
}
