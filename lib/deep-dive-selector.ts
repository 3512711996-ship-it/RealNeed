import type { IdeaJudgment, Opportunity } from "@/lib/types";
import { isQualifyingEvidenceSource } from "@/lib/evidence-policy";
import { enrichSourceRecord } from "@/lib/trust-analysis";

export type DeepDiveSelection = {
  selectedOpportunity?: Opportunity;
  rejectedReasons: string[];
};

export function selectDeepDiveOpportunity(judgment: IdeaJudgment): DeepDiveSelection {
  const rejectedReasons: string[] = [];
  const candidates = judgment.opportunities.filter((opportunity) => {
    const veto = hardVeto(opportunity, judgment);
    if (veto) {
      rejectedReasons.push(`${opportunity.productName}: ${veto}`);
      return false;
    }
    return true;
  });

  const selectedOpportunity = candidates
    .map((opportunity) => ({
      opportunity,
      priorityScore:
        judgment.scores.demandSignal * 0.25 +
        judgment.scores.paymentSignal * 0.2 +
        judgment.scores.beginnerFeasibility * 0.2 +
        judgment.scores.mvpSimplicity * 0.15 +
        judgment.scores.distributionAccess * 0.2 +
        opportunity.score * 0.1
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)[0]?.opportunity;

  if (!selectedOpportunity) {
    rejectedReasons.push("没有通过硬性筛选的机会，Deep Dive 应输出验证优先方案。");
  }

  return { selectedOpportunity, rejectedReasons };
}

function hardVeto(opportunity: Opportunity, judgment: IdeaJudgment) {
  const text = JSON.stringify(opportunity).toLowerCase();
  const qualifyingIds = new Set(
    judgment.scannedSources
      .map(enrichSourceRecord)
      .filter(isQualifyingEvidenceSource)
      .map((source) => source.sourceDisplayId ?? source.id)
  );

  if (opportunity.sourceIds.length === 0) return "没有绑定真实来源信号";
  if (!opportunity.sourceIds.some((id) => qualifyingIds.has(id))) return "没有绑定合格用户证据";
  if (/爬虫|scraper|crawl|未经授权|cookie/.test(text)) return "依赖未经授权的平台爬虫";
  if (/社区|平台|marketplace|network effect|大量用户/.test(text)) return "必须拥有大量用户才成立";
  if (/医疗|诊断|法律|诉讼|金融投资|贷款|保险/.test(text)) return "涉及复杂医疗、法律或金融能力";
  if (/训练数据|大模型训练|原生 app|native app|定位权限|通讯录/.test(text)) return "第一版技术复杂度过高";

  return "";
}
