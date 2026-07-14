import type { IdeaJudgment, VerdictType } from "@/lib/types";

const verdictTone = {
  BUILD_SMALL_MVP: "border-lime/70 bg-lime/25",
  VALIDATE_FIRST: "border-straw/70 bg-straw/25",
  TALK_TO_USERS: "border-line bg-white",
  KILL_OR_REFRAME: "border-clay/35 bg-clay/10"
} satisfies Record<VerdictType, string>;

export function VerdictBanner({ judgment }: { judgment: IdeaJudgment }) {
  const canShowScore = judgment.canShowOverallScore !== false && judgment.confidence !== "VERY_LOW" && judgment.confidence !== "LOW";

  return (
    <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
      <div className={`rounded-[12px] border p-5 shadow-paper sm:p-7 ${verdictTone[judgment.verdict]}`}>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-helper">Idea Judgment Report</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_180px] lg:items-center">
          <div>
            <h1 className="text-[34px] font-semibold leading-tight text-ink sm:text-[52px]">结论：{judgment.verdictText}</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-graphite">{judgment.verdictReason}</p>
          </div>
          <div className="rounded-[10px] border border-ink/10 bg-white p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-helper">{canShowScore ? "总分" : "置信度"}</p>
            {canShowScore ? (
              <>
                <p className="mt-2 font-mono text-5xl font-semibold text-ink">{judgment.scores.overall}</p>
                <p className="text-sm text-helper">/ 100</p>
              </>
            ) : (
              <>
                <p className="mt-3 text-2xl font-semibold text-ink">{judgment.confidence ?? "LOW"}</p>
                <p className="mt-2 text-sm leading-5 text-helper">证据不足时不展示精确分数</p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
