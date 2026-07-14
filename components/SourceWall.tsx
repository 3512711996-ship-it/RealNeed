"use client";

import { motion } from "framer-motion";
import { ExternalLink, ShieldCheck } from "lucide-react";
import {
  contentExtractionStatusLabel,
  evidenceEligibilityLabel,
  formatDirectVerificationReason,
  formatEvidenceReasonCodes,
  formatExtractionFailureReason,
  formatSignalExplanation,
  searchDiscoveryStatusLabel,
  signalStrengthLabel,
  sourceOriginLabel,
  sourceTypeLabel,
  verificationStatusLabel
} from "@/lib/source-display";
import type { DemandSignalStrength, ScannedSource } from "@/lib/types";
import { cn } from "@/lib/utils";

const signalConfig = {
  strong: {
    label: "强信号",
    className: "border-lime/80 bg-lime/30 text-ink",
    description: "来源里有明确抱怨、求助、替代方案不满或重复麻烦流程。"
  },
  medium: {
    label: "中信号",
    className: "border-straw/80 bg-straw/30 text-ink",
    description: "来源和想法相关，但还需要更多用户场景补充。"
  },
  weak: {
    label: "弱信号",
    className: "border-line bg-paper2 text-helper",
    description: "来源可访问，也可能相关，但痛点或目标用户不够明确。"
  },
  irrelevant: {
    label: "无关来源",
    className: "border-line bg-white text-helper",
    description: "来源可访问，但没有发现和这个想法直接相关的需求信号。"
  }
} satisfies Record<DemandSignalStrength, { label: string; className: string; description: string }>;

export function SourceWall({ sources }: { sources: ScannedSource[] }) {
  if (sources.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-helper">Source Wall</p>
          <h2 className="mt-1 text-[30px] font-semibold leading-tight text-ink sm:text-[38px]">先看来源真实性</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-helper">
            搜索发现、正文提取和直接 URL 验证分别记录。只有正文已提取且直接验证通过的来源，才会进入正式需求分析。
          </p>
        </div>
        <span className="rounded-[6px] border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">{sources.length} 条来源记录</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sources.map((source, index) => (
          <motion.article
            key={source.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.25 }}
            className="case-paper rounded-[10px] border border-line p-4 shadow-paper transition duration-200 hover:-translate-y-0.5 hover:border-ink/25 sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-helper">Source #{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 text-[19px] font-semibold leading-7 text-ink">{source.title}</h3>
              </div>
              <SignalTag
                strength={source.finalEvidenceStrength ?? source.signalStrength ?? "irrelevant"}
                counted={source.evidenceEligibility === "ELIGIBLE_USER_EVIDENCE"}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Meta label="平台" value={source.platform || "unknown"} />
              <Meta label="来源" value={sourceOriginLabel(source.origin)} icon />
              <Meta label="搜索" value={searchDiscoveryStatusLabel(source.searchDiscoveryStatus)} />
              <Meta label="正文" value={contentExtractionStatusLabel(source.contentExtractionStatus)} />
              <Meta label="直接验证" value={verificationStatusLabel(source.verificationStatus)} />
              {typeof source.statusCode === "number" ? <Meta label="HTTP" value={String(source.statusCode)} /> : null}
              {source.provider ? <Meta label="provider" value={source.provider} /> : null}
              {source.sourceType ? <Meta label="来源类型" value={sourceTypeLabel(source.sourceType)} /> : null}
              {source.evidenceEligibility ? <Meta label="证据资格" value={evidenceEligibilityLabel(source.evidenceEligibility)} /> : null}
              {source.modelSuggestedStrength ? <Meta label="模型建议" value={signalStrengthLabel(source.modelSuggestedStrength)} /> : null}
              {source.finalEvidenceStrength ? <Meta label="最终强度" value={signalStrengthLabel(source.finalEvidenceStrength)} /> : null}
              {typeof source.durationMs === "number" ? <Meta label="耗时" value={`${source.durationMs}ms`} /> : null}
              {typeof source.relevanceScore === "number" ? <Meta label="相关度" value={String(source.relevanceScore)} /> : null}
            </div>

            <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-sm">
              <Field label="对应搜索词" value={source.query} />
              {source.extractionFailureReason ? <Field label="正文提取说明" value={formatExtractionFailureReason(source.extractionFailureReason)} /> : null}
              {source.failureReason ? (
                <Field
                  label="直接验证说明"
                  value={formatDirectVerificationReason(source.failureReason, source.verificationStatus, source.statusCode)}
                />
              ) : null}
              {source.painPoint ? <Field label="痛点摘要" value={source.painPoint} /> : null}
              {source.targetUser ? <Field label="目标用户" value={source.targetUser} /> : null}
              {source.qualifyingExcerpt ? <Field label="可追溯证据摘录" value={source.qualifyingExcerpt} /> : null}
              {source.hardRuleReasonCodes?.length ? <Field label="降级/排除原因" value={formatEvidenceReasonCodes(source.hardRuleReasonCodes)} /> : null}
              <Field
                label={source.signalStrength === "strong" || source.signalStrength === "medium" ? "为什么通过" : "为什么信号弱"}
                value={formatSignalExplanation(source)}
              />
            </dl>

            {source.url ? (
              <a
                href={source.finalUrl || source.url}
                target="_blank"
                rel="noreferrer"
                data-cursor="open"
                data-cursor-magnetic="true"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ink underline-offset-4 transition hover:underline"
              >
                打开来源
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <p className="mt-4 text-xs leading-5 text-helper">来源类型：用户粘贴内容。是否可外部验证：否。</p>
            )}
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function SignalTag({ strength, counted }: { strength: DemandSignalStrength; counted: boolean }) {
  if (!counted) {
    return <span className="shrink-0 rounded-[6px] border border-line bg-paper2 px-2.5 py-1 text-xs font-semibold text-helper">未计入正式证据</span>;
  }
  const config = signalConfig[strength];
  return <span className={cn("shrink-0 rounded-[6px] border px-2.5 py-1 text-xs font-semibold", config.className)}>{config.label}</span>;
}

function Meta({ label, value, icon = false }: { label: string; value: string; icon?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[6px] border border-line bg-white px-2.5 py-1 text-xs text-helper">
      {icon ? <ShieldCheck className="h-3.5 w-3.5 text-ink" /> : null}
      <span>{label}:</span>
      <span className="font-semibold text-ink">{value}</span>
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.13em] text-helper">{label}</dt>
      <dd className="mt-1 leading-6 text-graphite">{value}</dd>
    </div>
  );
}
