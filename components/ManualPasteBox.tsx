"use client";

import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const exampleContent =
  "Reddit user: I hate tracking expenses because every budgeting app asks me to categorize too many things. I keep going back to a spreadsheet, but it takes too much time every month. Another freelancer replied that they also struggle with separating personal and business expenses and asked if there is a simpler tool for monthly cleanup.";

export function ManualPasteBox({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-4 rounded-[8px] border border-line bg-paper2 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label className="text-sm font-semibold text-ink" htmlFor="pastedContent">
            粘贴你看到的真实需求材料
          </label>
          <p className="mt-1 text-xs leading-5 text-helper">
            来源类型会标记为“用户粘贴内容”。是否可外部验证：否。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(exampleContent)}>
          <ClipboardList className="h-3.5 w-3.5" />
          填入示例
        </Button>
      </div>
      <Textarea
        id="pastedContent"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="粘贴你看到的 Reddit、知乎、小红书、抖音、B 站评论区内容。内容越真实，判断越准。"
        className="mt-3 min-h-[180px] rounded-[8px] bg-white"
      />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-helper">
        <span>手动模式只分析你提供的原文，不会伪装成外部来源。</span>
        <span>{value.trim().length} / 100</span>
      </div>
    </div>
  );
}
