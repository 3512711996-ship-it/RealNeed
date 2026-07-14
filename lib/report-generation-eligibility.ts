import { getServerEnv } from "@/lib/env";
import { buildDeepDiveEligibility } from "@/lib/deep-dive-eligibility";
import type { IdeaJudgment, ReportGenerationEligibility } from "@/lib/types";

export type GenerationCredentialState = "ACTIVE" | "MISSING" | "INVALID" | "EXPIRED" | "UNSUPPORTED";

/**
 * This is deliberately separate from the evidence decision. A report is free, but
 * the official instance requires an active user-provided generation credential.
 */
export function buildReportGenerationEligibility(
  judgment: IdeaJudgment,
  generationCredential: GenerationCredentialState = "MISSING",
  options: { searchRequired?: boolean; searchCredential?: GenerationCredentialState; workerAvailable?: boolean; databaseAvailable?: boolean } = {}
): ReportGenerationEligibility {
  const conceptual = buildDeepDiveEligibility(judgment);
  const base = {
    generationCredentialRequired: true as const,
    searchCredentialRequired: Boolean(options.searchRequired),
    searchCredentialReady: !options.searchRequired || options.searchCredential === "ACTIVE",
    evidenceStats: conceptual.evidenceStats
  };

  if (!options.databaseAvailable && options.databaseAvailable !== undefined) {
    return { eligible: false, reportMode: null, generationCredentialReady: generationCredential === "ACTIVE", blockingReason: "DATABASE_UNAVAILABLE", reason: "数据库暂时不可用，无法安全保存私有报告。", ...base };
  }
  if (!options.workerAvailable && options.workerAvailable !== undefined) {
    return { eligible: false, reportMode: null, generationCredentialReady: generationCredential === "ACTIVE", blockingReason: "WORKER_UNAVAILABLE", reason: "后台 Worker 当前不可用，无法开始报告生成。", ...base };
  }
  if (!conceptual.canPurchase || !conceptual.mode) {
    return { eligible: false, reportMode: null, generationCredentialReady: generationCredential === "ACTIVE", blockingReason: "SYSTEM_UNAVAILABLE", reason: conceptual.reason.replace("购买", "生成"), ...base };
  }
  const allowInstance = getServerEnv().allowInstanceApiForReports;
  if (generationCredential === "MISSING" && !allowInstance) {
    return { eligible: false, reportMode: conceptual.mode, generationCredentialReady: false, blockingReason: "GENERATION_API_NOT_CONNECTED", reason: "请先连接并验证自己的生成模型 API。RealNeed 不会用平台 Key 代替你生成报告。", ...base };
  }
  if (generationCredential === "INVALID") return { eligible: false, reportMode: conceptual.mode, generationCredentialReady: false, blockingReason: "GENERATION_API_INVALID", reason: "你的生成模型 API 连接无效或额度不足，请更新后继续。", ...base };
  if (generationCredential === "EXPIRED") return { eligible: false, reportMode: conceptual.mode, generationCredentialReady: false, blockingReason: "GENERATION_API_EXPIRED", reason: "你的生成模型 API 连接已过期，请更新后继续。", ...base };
  if (generationCredential === "UNSUPPORTED") return { eligible: false, reportMode: conceptual.mode, generationCredentialReady: false, blockingReason: "MODEL_UNSUPPORTED", reason: "当前模型不支持 RealNeed 的结构化报告输出。", ...base };
  if (options.searchRequired && options.searchCredential !== "ACTIVE") {
    return { eligible: false, reportMode: conceptual.mode, generationCredentialReady: generationCredential === "ACTIVE", blockingReason: options.searchCredential === "EXPIRED" ? "SEARCH_API_EXPIRED" : options.searchCredential === "INVALID" ? "SEARCH_API_INVALID" : "SEARCH_API_NOT_CONNECTED", reason: "你选择了补充搜索，但搜索 API 还没有可用连接。", ...base };
  }
  return { eligible: true, reportMode: conceptual.mode, generationCredentialReady: generationCredential === "ACTIVE" || allowInstance, blockingReason: "NONE", reason: "可以免费生成报告。将使用你选择的生成模型 API。", ...base };
}
