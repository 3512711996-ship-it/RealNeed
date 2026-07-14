"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "复制",
  copiedLabel = "已复制",
  className
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      data-cursor="copy"
      data-cursor-magnetic="true"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:-translate-y-0.5 hover:border-ink/25",
        className
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? copiedLabel : label}
    </button>
  );
}
