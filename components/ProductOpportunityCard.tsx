import { ArrowRight, CheckCircle2 } from "lucide-react";
import { OpportunityScoreBars } from "@/components/OpportunityScoreBars";
import { SkepticReview } from "@/components/SkepticReview";
import { Button } from "@/components/ui/button";
import type { EvidenceSource, ProductOpportunity } from "@/lib/types";

const difficultyLabel = {
  easy: "新手可做",
  medium: "需要克制范围",
  hard: "不推荐新手"
} satisfies Record<ProductOpportunity["difficulty"], string>;

export function ProductOpportunityCard({
  opportunity,
  evidence,
  rank,
  onGenerateFreeReport
}: {
  opportunity: ProductOpportunity;
  evidence: EvidenceSource[];
  rank: number;
  onGenerateFreeReport: () => void;
}) {
  const relatedEvidence = opportunity.sourceEvidenceIds
    .map((id) => evidence.find((item) => item.id === id))
    .filter(Boolean) as EvidenceSource[];

  return (
    <article className="overflow-hidden rounded-[10px] border border-line bg-white shadow-paper transition duration-200 hover:-translate-y-0.5 hover:border-ink/25">
      <div className="grid gap-4 border-b border-line bg-paper p-4 sm:p-5 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[6px] border border-ink bg-ink px-2.5 py-1 text-xs font-semibold text-paper">
              Opportunity {String(rank + 1).padStart(2, "0")}
            </span>
            <span className="rounded-[6px] border border-lime/70 bg-lime/25 px-2.5 py-1 text-xs font-semibold text-ink">
              {difficultyLabel[opportunity.difficulty]}
            </span>
          </div>
          <h2 className="mt-4 text-[24px] font-semibold leading-tight text-ink sm:text-[30px]">{opportunity.productName}</h2>
          <p className="mt-2 max-w-3xl text-[15px] leading-7 text-graphite">{opportunity.oneSentence}</p>
        </div>
        <div className="rounded-[8px] border border-line bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-helper">Opportunity Score</p>
          <p className="mt-1 font-mono text-4xl font-semibold text-ink">{opportunity.evidenceScore}</p>
          <div className="mt-3">
            <OpportunityScoreBars opportunity={opportunity} relatedEvidence={relatedEvidence} />
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[0.82fr_1.18fr]">
        <dl className="grid gap-4 text-sm">
          <Info label="适合谁" value={opportunity.targetUser} />
          <Info label="真实痛点" value={opportunity.painPoint} />
          <Info label="为什么不是泛泛工具" value={opportunity.whyNotGeneric} />
        </dl>

        <div className="grid gap-4">
          <ReportSection title="MVP 怎么做" value={opportunity.mvp} />
          <ReportSection title="第一步验证动作" value={opportunity.firstStep} />
          <ReportSection title="中国环境怎么收费" value={`${opportunity.monetization} ${opportunity.chinaFit}`} />

          <section className="border-t border-line pt-4">
            <h3 className="text-sm font-semibold text-ink">关联证据</h3>
            <div className="mt-3 grid gap-2">
              {relatedEvidence.map((item, index) => (
                <div key={item.id} className="grid grid-cols-[28px_1fr] gap-2 text-sm leading-6 text-graphite">
                  <span className="grid h-7 w-7 place-items-center rounded-[6px] border border-line bg-paper font-mono text-xs text-helper">
                    {index + 1}
                  </span>
                  <span>{item.painPoint}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-semibold text-ink">风险</h3>
            {opportunity.risks.length ? (
              <ul className="grid gap-1 text-sm leading-6 text-graphite">
                {opportunity.risks.map((risk) => (
                  <li key={risk} className="grid grid-cols-[18px_1fr] gap-2">
                    <CheckCircle2 className="mt-1 h-4 w-4 text-helper" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-helper">当前风险未明确，下一步必须继续收集用户反馈。</p>
            )}
          </section>

          <SkepticReview opportunity={opportunity} />
        </div>
      </div>

      <div className="border-t border-line px-4 py-4 sm:px-5">
        <Button variant="outline" onClick={onGenerateFreeReport} data-cursor="view" data-cursor-magnetic="true">
          查看 Deep Dive
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line pb-3 last:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.13em] text-helper">{label}</dt>
      <dd className="mt-1 text-sm leading-7 text-graphite">{value}</dd>
    </div>
  );
}

function ReportSection({ title, value }: { title: string; value: string }) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-graphite">{value}</p>
    </section>
  );
}
