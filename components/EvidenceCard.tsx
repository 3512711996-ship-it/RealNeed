import { ExternalLink, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { EvidenceSource, EvidenceStrength } from "@/lib/types";
import { cn } from "@/lib/utils";

const strengthConfig = {
  weak: { label: "weak", className: "border-line bg-paper2 text-helper" },
  medium: { label: "medium", className: "border-straw/70 bg-straw/30 text-ink" },
  strong: { label: "strong", className: "border-lime/80 bg-lime/30 text-ink" }
} satisfies Record<EvidenceStrength, { label: string; className: string }>;

export function EvidenceCard({ evidence, index }: { evidence: EvidenceSource; index: number }) {
  const isVerified = evidence.sourceVerification?.isExternalVerified === true;
  const isPasted = evidence.platform.includes("粘贴") || evidence.platform === "user_paste";
  const verificationLabel = isVerified ? "verified" : isPasted ? "pasted" : "unverified";
  const displayStrength: EvidenceStrength = !isVerified && evidence.evidenceStrength === "strong" ? "medium" : evidence.evidenceStrength;
  const strength = strengthConfig[displayStrength];

  return (
    <article className="case-paper h-full rounded-[10px] border border-line p-4 shadow-paper transition duration-200 hover:-translate-y-0.5 hover:border-ink/25 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-helper">Evidence #{String(index + 1).padStart(2, "0")}</p>
          <h3 className="mt-2 text-[19px] font-semibold leading-7 text-ink">{evidence.title}</h3>
        </div>
        <span className={cn("shrink-0 rounded-[6px] border px-2.5 py-1 text-xs font-semibold", strength.className)}>{strength.label}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Tag label="平台" value={evidence.platform} />
        <Tag label="验证状态" value={verificationLabel} icon={isVerified ? ShieldCheck : ShieldQuestion} />
        <Tag label="相关度" value={String(evidence.relevanceScore)} />
      </div>

      <blockquote className="mt-4 border-l-2 border-ink/20 pl-3 text-sm leading-6 text-graphite">
        {evidence.userQuoteOrSummary ?? evidence.sourceText}
      </blockquote>

      <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-sm">
        <Field label="痛点摘要" value={evidence.painPoint} />
        <Field label="目标用户" value={evidence.targetUser} />
        {evidence.existingAlternative ? <Field label="现有替代方案" value={evidence.existingAlternative} /> : null}
        {evidence.whyThisIsDemand ? <Field label="为什么这是需求" value={evidence.whyThisIsDemand} /> : null}
      </dl>

      {evidence.url && isVerified ? (
        <a
          href={evidence.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ink underline-offset-4 transition hover:underline"
        >
          查看来源链接
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </article>
  );
}

function Tag({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof ShieldCheck }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[6px] border border-line bg-white px-2.5 py-1 text-xs text-helper">
      {Icon ? <Icon className="h-3.5 w-3.5 text-ink" /> : null}
      <span className="text-helper">{label}:</span>
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
