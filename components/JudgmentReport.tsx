"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, ClipboardPaste } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { DeepDiveLocked } from "@/components/DeepDiveLocked";
import { EvidenceAuditSummary } from "@/components/EvidenceAuditSummary";
import { FilteredSources } from "@/components/FilteredSources";
import { JudgmentScoreBars } from "@/components/JudgmentScoreBars";
import { NoSignalState } from "@/components/NoSignalState";
import { OpportunityCompression } from "@/components/OpportunityCompression";
import { ScanFunnel } from "@/components/ScanFunnel";
import { SourceWall } from "@/components/SourceWall";
import { TodayActionCard } from "@/components/TodayActionCard";
import { VerdictBanner } from "@/components/VerdictBanner";
import { recordAnalyticsEvent } from "@/lib/analytics";
import type { IdeaJudgment } from "@/lib/types";

export function JudgmentReport({
  judgment,
  onGenerateFreeReport
}: {
  judgment: IdeaJudgment;
  onGenerateFreeReport: () => void;
}) {
  const manualPaste = judgment.accessibleSources.some((source) => !source.url || source.platform.includes("用户粘贴"));
  const hasStrongOrMedium = judgment.strongSignals.length + judgment.mediumSignals.length > 0;
  const canShowOpportunities = judgment.marketVerdict !== "NOT_AVAILABLE" && judgment.opportunities.length > 0 && (judgment.qualifyingIndependentEvidenceCount ?? 0) >= 2;
  const canShowDeepDiveOffer = Boolean(judgment.deepDiveOffer?.canGenerate && judgment.deepDiveOffer.mode);
  const offerEventSent = useRef(false);

  useEffect(() => {
    if (!canShowDeepDiveOffer || offerEventSent.current) return;
    offerEventSent.current = true;
    recordAnalyticsEvent({
      eventType: "free_report_offer_viewed",
      judgmentId: judgment.judgmentId,
      properties: { mode: judgment.deepDiveOffer?.mode ?? null, reportCode: judgment.reportCode ?? null }
    });
  }, [canShowDeepDiveOffer, judgment.deepDiveOffer?.mode, judgment.judgmentId, judgment.reportCode]);

  return (
    <>
      {judgment.reportCode ? (
        <section className="mx-auto max-w-[1120px] px-4 pt-6 sm:px-6">
          <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-white p-4 shadow-paper sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-helper">Report Code</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-ink">{judgment.reportCode}</p>
              <p className="mt-2 text-xs text-helper">
                技术状态：{judgment.technicalOutcome ?? "READY"} · 市场判断：{judgment.marketVerdict ?? judgment.verdict} · 独立证据：
                {judgment.qualifyingIndependentEvidenceCount ?? 0}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={judgment.reportCode} label="复制报告编号" copiedLabel="已复制报告编号" />
              {judgment.recoveryUrl ? <CopyButton value={judgment.recoveryUrl} label="复制恢复链接" copiedLabel="已复制恢复链接" /> : null}
            </div>
          </div>
        </section>
      ) : null}
      <VerdictBanner judgment={judgment} />
      <JudgmentScoreBars judgment={judgment} />
      <ScanFunnel judgment={judgment} />
      <EvidenceAuditSummary judgment={judgment} />

      <section className="mx-auto max-w-[1120px] px-4 pb-4 sm:px-6">
        <details className="rounded-[8px] border border-line bg-white p-4 shadow-paper">
          <summary className="cursor-pointer text-sm font-semibold text-ink">查看本次搜索词</summary>
          <div className="mt-4 flex flex-wrap gap-2">
            {judgment.searchQueries.map((query) => (
              <span key={query} className="rounded-[6px] border border-line bg-paper px-2.5 py-1 text-xs leading-5 text-graphite">
                {query}
              </span>
            ))}
          </div>
        </details>
      </section>

      {manualPaste ? (
        <Notice icon={<ClipboardPaste className="mt-0.5 h-4 w-4 shrink-0 text-ink" />}>
          以下证据来自用户粘贴内容，未进行外部网页验证。系统不会把它伪装成 Reddit / 知乎 / 小红书链接。
        </Notice>
      ) : null}

      {judgment.partialVerificationWarning ? (
        <Notice icon={<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clay" />}>{judgment.partialVerificationWarning}</Notice>
      ) : null}

      {judgment.warnings.length ? (
        <Notice icon={<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clay" />}>
          {judgment.warnings.join(" ")}
        </Notice>
      ) : null}

      <SourceWall sources={judgment.scannedSources} />

      {!hasStrongOrMedium || judgment.accessibleSources.length === 0 ? (
        <NoSignalState hasAccessibleSources={judgment.accessibleSources.length > 0} message={judgment.verdictReason} />
      ) : null}

      {canShowOpportunities ? <OpportunityCompression judgment={judgment} onGenerateFreeReport={onGenerateFreeReport} /> : null}
      <TodayActionCard action={judgment.todayAction} sources={judgment.scannedSources} judgmentId={judgment.judgmentId} />
      <FilteredSources sources={judgment.inaccessibleSources} />
      {canShowDeepDiveOffer && judgment.deepDiveOffer?.mode ? (
        <DeepDiveLocked mode={judgment.deepDiveOffer.mode} offer={judgment.deepDiveOffer} generationEligibility={judgment.reportGenerationEligibility} onOpen={onGenerateFreeReport} />
      ) : null}
    </>
  );
}

function Notice({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <section className="mx-auto max-w-[1120px] px-4 pb-4 sm:px-6">
      <div className="flex items-start gap-3 rounded-[8px] border border-line bg-white p-4 text-sm leading-6 text-graphite shadow-paper">
        {icon}
        <p>{children}</p>
      </div>
    </section>
  );
}
