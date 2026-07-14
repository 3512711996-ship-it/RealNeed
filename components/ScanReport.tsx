import { FileSearch, ShieldCheck, XCircle } from "lucide-react";
import type { AnalyzeResponse } from "@/lib/types";

export function ScanReport({ data }: { data: AnalyzeResponse }) {
  const canGenerate = data.canGenerateOpportunities;

  return (
    <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-helper">Scan Report</p>
          <h1 className="mt-1 text-[34px] font-semibold leading-tight text-ink sm:text-[46px]">本次扫描报告</h1>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-[6px] border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
          {canGenerate ? <ShieldCheck className="h-4 w-4 text-ink" /> : <XCircle className="h-4 w-4 text-clay" />}
          {canGenerate ? "允许生成机会" : "信号不足，停止生成"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.04fr_1.26fr]">
        <div className="case-paper rounded-[8px] border border-line p-5 shadow-paper">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-helper">
            <FileSearch className="h-4 w-4" />
            Case File
          </div>
          <dl className="mt-5 grid gap-4 text-sm">
            <ReportField label="原始想法" value={data.originalIdea} />
            <ReportField
              label="系统理解"
              value={`RealNeed 将它理解为「${data.interpretedIdea.domain}」，目标用户可能是：${data.interpretedIdea.targetUsers.join("、") || "待确认"}`}
            />
            {data.stopReason ? <ReportField label="停止原因" value={data.stopReason} /> : null}
          </dl>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ReportMetric label="搜索线索" value={data.scannedSources.length} />
          <ReportMetric label="可访问原帖" value={data.accessibleSources.length} />
          <ReportMetric label="不可访问" value={data.inaccessibleSources.length} />
          <ReportMetric label="强信号" value={data.strongSignals.length} />
          <ReportMetric label="中信号" value={data.mediumSignals.length} />
          <ReportMetric label="弱信号" value={data.weakSignals.length} />
          <ReportMetric label="无关来源" value={data.irrelevantSources.length} />
          <ReportMetric label="生成机会" value={data.opportunities.length} />
        </div>
      </div>
    </section>
  );
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.13em] text-helper">{label}</dt>
      <dd className="mt-1 text-base leading-7 text-ink">{value}</dd>
    </div>
  );
}

function ReportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[8px] border border-line bg-white p-4 shadow-paper">
      <p className="min-h-9 text-xs leading-5 text-helper">{label}</p>
      <p className="mt-3 font-mono text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}
