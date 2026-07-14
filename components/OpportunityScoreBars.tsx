"use client";

import { motion } from "framer-motion";
import type { EvidenceSource, ProductOpportunity } from "@/lib/types";

export function OpportunityScoreBars({
  opportunity,
  relatedEvidence
}: {
  opportunity: ProductOpportunity;
  relatedEvidence: EvidenceSource[];
}) {
  const bars = [
    { label: "证据强度", value: scoreEvidenceStrength(relatedEvidence, opportunity.evidenceScore) },
    { label: "新手可做", value: opportunity.difficulty === "easy" ? 88 : opportunity.difficulty === "medium" ? 68 : 38 },
    { label: "国内变现", value: scoreText(opportunity.monetization + opportunity.chinaFit, ["微信", "低成本", "单次", "订阅", "人民币", "人工", "试用"], 62) },
    { label: "MVP 简单度", value: scoreText(opportunity.mvp, ["人工", "表单", "粘贴", "单页", "模板", "手动", "1-3"], opportunity.difficulty === "easy" ? 84 : 66) }
  ];

  return (
    <div className="grid gap-3">
      {bars.map((bar, index) => (
        <div key={bar.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-ink">{bar.label}</span>
            <span className="font-mono text-helper">{bar.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/8">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${bar.value}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.72, delay: index * 0.08, ease: "easeOut" }}
              className="h-full rounded-full bg-lime"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function scoreEvidenceStrength(evidence: EvidenceSource[], fallback: number) {
  if (evidence.length === 0) return clamp(fallback, 0, 100);

  const value =
    evidence.reduce((sum, item) => {
      const verified = item.sourceVerification?.isExternalVerified === true;
      if (!verified && item.evidenceStrength === "strong") return sum + 72;
      if (item.evidenceStrength === "strong") return sum + 92;
      if (item.evidenceStrength === "medium") return sum + 72;
      return sum + 48;
    }, 0) / evidence.length;

  return clamp(Math.round(value), 0, 100);
}

function scoreText(text: string, signals: string[], base: number) {
  const lower = text.toLowerCase();
  const hits = signals.filter((signal) => lower.includes(signal.toLowerCase())).length;
  return clamp(base + hits * 5, 0, 92);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
