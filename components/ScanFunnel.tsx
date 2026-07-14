import { Filter, Search, ShieldAlert, ShieldCheck, Signal } from "lucide-react";
import type { IdeaJudgment } from "@/lib/types";

export function ScanFunnel({ judgment }: { judgment: IdeaJudgment }) {
  const coverage = judgment.verificationCoverage;
  const confirmed = judgment.scannedSources.filter((source) => source.evidenceAvailability === "CONFIRMED_CONTENT").length;
  const searchLead = judgment.scannedSources.filter((source) => source.evidenceAvailability === "SEARCH_LEAD").length;
  const independent = judgment.qualifyingIndependentEvidenceCount ?? 0;
  const items = [
    { label: "搜索发现", value: coverage?.searchResultCount ?? coverage?.totalCandidates ?? judgment.scannedSources.length, icon: Search },
    { label: "去重来源", value: coverage?.deduplicatedCandidates ?? judgment.scannedSources.length, icon: Filter },
    { label: "正文提取", value: coverage?.extractedContentCount ?? confirmed, icon: ShieldCheck },
    { label: "直接验证", value: coverage?.directVerifiedCount ?? coverage?.accessibleCount ?? 0, icon: ShieldCheck },
    { label: "搜索线索", value: searchLead, icon: ShieldAlert },
    { label: "独立证据", value: independent, icon: Signal }
  ];

  return (
    <section className="mx-auto max-w-[1120px] px-4 pb-8 sm:px-6">
      <div className="rounded-[10px] border border-line bg-paper2 p-4 shadow-paper sm:p-5">
        <div className="mb-5">
          <p className="text-sm font-semibold text-helper">Scan Funnel</p>
          <h2 className="text-2xl font-semibold text-ink">本次判断漏斗</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-[8px] border border-line bg-white p-4 shadow-paper">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-helper">{item.label}</span>
                  <Icon className="h-4 w-4 text-ink" />
                </div>
                <p className="mt-3 font-mono text-4xl font-semibold text-ink">{item.value}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-helper">
          <span className="rounded-[6px] border border-lime/70 bg-lime/25 px-2.5 py-1">强信号 {judgment.strongSignals.length}</span>
          <span className="rounded-[6px] border border-straw/70 bg-straw/25 px-2.5 py-1">中信号 {judgment.mediumSignals.length}</span>
          <span className="rounded-[6px] border border-line bg-white px-2.5 py-1">弱信号 {judgment.weakSignals.length}</span>
          <span className="rounded-[6px] border border-line bg-white px-2.5 py-1">无关来源 {judgment.irrelevantSources.length}</span>
          <span className="rounded-[6px] border border-line bg-white px-2.5 py-1">用户证据候选 {judgment.userEvidenceCandidateCount ?? 0}</span>
          <span className="rounded-[6px] border border-line bg-white px-2.5 py-1">合格用户证据 {judgment.qualifyingUserEvidenceCount ?? 0}</span>
          <span className="rounded-[6px] border border-line bg-white px-2.5 py-1">背景来源 {judgment.backgroundSourceCount ?? 0}</span>
          <span className="rounded-[6px] border border-line bg-white px-2.5 py-1">商业来源 {judgment.commercialSourceCount ?? 0}</span>
          {coverage ? <span className="rounded-[6px] border border-line bg-white px-2.5 py-1">待验证 {coverage.unverifiedCount}</span> : null}
          {coverage ? <span className="rounded-[6px] border border-line bg-white px-2.5 py-1">缓存命中 {coverage.cacheHitCount}</span> : null}
          {typeof coverage?.searchStage?.durationMs === "number" ? (
            <span className="rounded-[6px] border border-line bg-white px-2.5 py-1">搜索 {coverage.searchStage.durationMs}ms</span>
          ) : null}
          {typeof coverage?.extractionStage?.durationMs === "number" ? (
            <span className="rounded-[6px] border border-line bg-white px-2.5 py-1">正文提取 {coverage.extractionStage.durationMs}ms</span>
          ) : null}
          {typeof coverage?.directVerificationStage?.durationMs === "number" ? (
            <span className="rounded-[6px] border border-line bg-white px-2.5 py-1">直接验证 {coverage.directVerificationStage.durationMs}ms</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
