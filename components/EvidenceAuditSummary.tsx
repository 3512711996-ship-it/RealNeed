import { CircleCheck, CircleX, FileSearch, ShieldAlert } from "lucide-react";
import type { IdeaJudgment } from "@/lib/types";

export function EvidenceAuditSummary({ judgment }: { judgment: IdeaJudgment }) {
  const sources = judgment.scannedSources;
  const extracted = sources.filter((source) => source.evidenceAvailability === "CONFIRMED_CONTENT").length;
  const directlyVerified = sources.filter(
    (source) => source.verificationStatus === "ACCESSIBLE" || source.verificationStatus === "REDIRECTED_ACCESSIBLE"
  ).length;
  const qualified = sources.filter((source) => source.evidenceEligibility === "ELIGIBLE_USER_EVIDENCE").length;
  const blocked = sources.filter((source) => ["BLOCKED", "RATE_LIMITED", "TIMEOUT", "NETWORK_ERROR"].includes(source.verificationStatus ?? "")).length;
  const rejectedAfterVerification = Math.max(0, directlyVerified - qualified);

  if (sources.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1120px] px-4 pb-4 sm:px-6">
      <div className="rounded-[8px] border border-line bg-white p-4 shadow-paper">
        <p className="text-sm font-semibold text-ink">这次为什么没有生成方向</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AuditItem icon={FileSearch} label="已提取正文" value={`${extracted} 条`} description="搜索服务拿到了足够可分析的正文。" />
          <AuditItem icon={CircleCheck} label="原网页可验证" value={`${directlyVerified} 条`} description="RealNeed 服务器可直接读取原网页。" />
          <AuditItem icon={ShieldAlert} label="通过需求审核" value={`${qualified} 条`} description="同时具备用户、场景、痛点与可追溯原文。" tone="lime" />
          <AuditItem icon={CircleX} label="未计入正式证据" value={`${Math.max(blocked, rejectedAfterVerification)} 条`} description={blocked > 0 ? "包含访问受限或超时的来源；它们不会被伪装成证据。" : "其余来源没有形成足够明确的用户需求信号。"} />
        </div>
        <p className="mt-4 text-sm leading-6 text-graphite">
          {directlyVerified >= 2
            ? `本次不是“完全没搜到网页”：已有 ${directlyVerified} 条原网页通过验证。但只有 ${qualified} 条通过需求硬规则，因此不足以支撑产品方向。`
            : `本次主要卡在来源可访问性：只有 ${directlyVerified} 条原网页完成验证。这个结果不等于“没有需求”，而是“当前还没有足够可验证的需求证据”。`}
        </p>
      </div>
    </section>
  );
}

function AuditItem({
  icon: Icon,
  label,
  value,
  description,
  tone = "default"
}: {
  icon: typeof FileSearch;
  label: string;
  value: string;
  description: string;
  tone?: "default" | "lime";
}) {
  return (
    <div className={tone === "lime" ? "rounded-[8px] border border-lime/70 bg-lime/15 p-3" : "rounded-[8px] border border-line bg-paper p-3"}>
      <div className="flex items-center gap-2 text-xs font-semibold text-helper">
        <Icon className="h-4 w-4 text-ink" />
        {label}
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-helper">{description}</p>
    </div>
  );
}
