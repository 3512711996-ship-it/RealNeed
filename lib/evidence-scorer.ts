import type { EvidenceSource, InterpretedIdea } from "@/lib/types";

export function scoreEvidence(evidence: EvidenceSource[], interpretedIdea: InterpretedIdea): EvidenceSource[] {
  return evidence
    .map((item) => {
      const relevance = scoreRelevance(item, interpretedIdea);
      const painReality = scorePainReality(item);
      const targetClarity = item.targetUser && item.targetUser !== "有相关痛点的用户" ? 18 : 10;
      const mvpMapping = scoreMvpMapping(item);
      const relevanceScore = relevance + painReality + targetClarity + mvpMapping;

      return {
        ...item,
        relevanceScore,
        scoreBreakdown: {
          relevance,
          painReality,
          targetClarity,
          mvpMapping
        }
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function scoreRelevance(item: EvidenceSource, interpretedIdea: InterpretedIdea) {
  const text = `${item.sourceText} ${item.painPoint}`.toLowerCase();
  const keywords = [...interpretedIdea.keywordsZh, ...interpretedIdea.keywordsEn, interpretedIdea.domain]
    .map((keyword) => keyword.toLowerCase())
    .filter(Boolean);
  const hits = keywords.filter((keyword) => text.includes(keyword)).length;

  return Math.min(30, 12 + hits * 5);
}

function scorePainReality(item: EvidenceSource) {
  const strengthMap = {
    weak: 14,
    medium: 22,
    strong: 28
  } satisfies Record<EvidenceSource["evidenceStrength"], number>;

  return strengthMap[item.evidenceStrength];
}

function scoreMvpMapping(item: EvidenceSource) {
  const text = `${item.sourceText} ${item.painPoint}`.toLowerCase();
  const mappableSignals = ["整理", "记录", "分类", "提醒", "生成", "对比", "检查", "清单", "模板", "重复", "麻烦", "manual", "list", "track"];
  const hits = mappableSignals.filter((signal) => text.includes(signal)).length;

  return Math.min(20, 10 + hits * 3);
}
