"use client";

import type { ClarificationResponse } from "@/lib/types";
import { Textarea } from "@/components/ui/textarea";

export type ClarificationAnswers = {
  targetUser?: string;
  painfulScene?: string;
  productForm?: string;
};

export function ClarificationForm({
  questions,
  answers,
  onChange
}: {
  questions: ClarificationResponse["questions"];
  answers: ClarificationAnswers;
  onChange: (answers: ClarificationAnswers) => void;
}) {
  return (
    <div className="mt-4 rounded-[10px] border border-straw/60 bg-straw/15 p-4">
      <p className="text-sm font-semibold text-ink">这个想法还太泛，先澄清 2-3 个问题</p>
      <p className="mt-1 text-xs leading-5 text-helper">回答后再判断，系统会把你的答案加入搜索和 MVP 压缩里。</p>
      <div className="mt-3 grid gap-3">
        {questions.map((item) => (
          <label key={item.id} className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-helper">{item.question}</span>
            <Textarea
              value={answers[item.id] ?? ""}
              onChange={(event) => onChange({ ...answers, [item.id]: event.target.value })}
              placeholder={item.placeholder}
              className="mt-1 min-h-[84px] rounded-[8px] bg-white"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
