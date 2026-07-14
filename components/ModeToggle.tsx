"use client";

import type { LucideIcon } from "lucide-react";
import { ClipboardPaste, Search } from "lucide-react";
import type { AnalyzeMode } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ModeToggle({
  mode,
  onChange
}: {
  mode: AnalyzeMode;
  onChange: (mode: AnalyzeMode) => void;
}) {
  const items: { value: AnalyzeMode; label: string; hint: string; icon: LucideIcon }[] = [
    { value: "auto_search", label: "自动搜索", hint: "查公开网页信号", icon: Search },
    { value: "manual_paste", label: "手动粘贴", hint: "分析你提供的评论", icon: ClipboardPaste }
  ];

  return (
    <div className="grid gap-2 rounded-[8px] border border-line bg-paper p-1.5 sm:grid-cols-2" role="tablist">
      {items.map((item) => {
        const Icon = item.icon;
        const active = mode === item.value;

        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-[7px] px-3 text-left transition",
              active ? "bg-white text-ink shadow-paper" : "text-helper hover:bg-white/70 hover:text-ink"
            )}
          >
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[6px] border", active ? "border-lime bg-lime/35" : "border-line bg-white")}>
              <Icon className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-xs text-helper">{item.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
