import { prisma } from "@/lib/prisma";

type UsageLike = {
  judgmentId: string | null;
  deepDiveId: string | null;
  provider: string;
  providerType?: "SEARCH" | "GENERATION";
  credentialSource?: "PLATFORM" | "USER_PROVIDED";
  operation: string;
  requestCount: number;
  creditsUsed: unknown;
  estimatedCostCny: unknown;
  success: boolean;
  errorCode: string | null;
  deepDiveReport?: { mode: "EVIDENCE_EXECUTION" | "IDEA_SIGNAL_REPAIR" } | null;
  job?: { status: string; attemptCount: number; type: string } | null;
};

export async function collectCostMetrics() {
  const [judgmentCount, readyCount, insufficientCount, failedJobs, usage] = await Promise.all([
    prisma.ideaJudgmentRecord.count({ where: { deletedAt: null } }),
    prisma.ideaJudgmentRecord.count({ where: { technicalOutcome: "READY", deletedAt: null } }),
    prisma.ideaJudgmentRecord.count({ where: { technicalOutcome: "INSUFFICIENT_EVIDENCE", deletedAt: null } }),
    prisma.job.count({ where: { status: "FAILED" } }),
    prisma.apiUsageRecord.findMany({
      select: {
        judgmentId: true, deepDiveId: true, provider: true, providerType: true, credentialSource: true,
        operation: true, requestCount: true, creditsUsed: true, estimatedCostCny: true, success: true, errorCode: true,
        deepDiveReport: { select: { mode: true } },
        job: { select: { status: true, attemptCount: true, type: true } }
      }
    })
  ]);
  return calculateCostMetrics({ judgmentCount, readyCount, insufficientCount, failedJobs, usage });
}

export function calculateCostMetrics(input: { judgmentCount: number; readyCount: number; insufficientCount: number; failedJobs: number; usage: UsageLike[] }) {
  const userUsage = input.usage.filter((item) => item.credentialSource === "USER_PROVIDED");
  const platformUsage = input.usage.filter((item) => item.credentialSource !== "USER_PROVIDED");
  const repairCosts = groupCosts(input.usage.filter((item) => item.deepDiveReport?.mode === "IDEA_SIGNAL_REPAIR"), (item) => item.deepDiveId ?? `${item.judgmentId}:repair`);
  const executionCosts = groupCosts(input.usage.filter((item) => item.deepDiveReport?.mode === "EVIDENCE_EXECUTION"), (item) => item.deepDiveId ?? `${item.judgmentId}:execution`);
  const failures = input.usage.filter((item) => !item.success || item.job?.status === "FAILED" || (item.job?.attemptCount ?? 0) > 1);
  return {
    judgmentCount: input.judgmentCount,
    readyCount: input.readyCount,
    insufficientCount: input.insufficientCount,
    failedJobs: input.failedJobs,
    apiRequestCount: input.usage.reduce((sum, item) => sum + item.requestCount, 0),
    byokRequestCount: userUsage.reduce((sum, item) => sum + item.requestCount, 0),
    estimatedPlatformCostCny: round(sumCost(platformUsage)),
    userProviderEstimatedCostCny: round(sumCost(userUsage)),
    deepDiveCostByMode: { IDEA_SIGNAL_REPAIR: describeCosts(repairCosts), EVIDENCE_EXECUTION: describeCosts(executionCosts) },
    providerSuccess: summarizeProviders(input.usage),
    failedAndRetryCost: { requestCount: failures.reduce((sum, item) => sum + item.requestCount, 0), estimatedCostCny: round(sumCost(failures)) }
  };
}

function summarizeProviders(usage: UsageLike[]) {
  const groups = new Map<string, { requestCount: number; successCount: number; failureCount: number }>();
  for (const item of usage) {
    const current = groups.get(item.provider) ?? { requestCount: 0, successCount: 0, failureCount: 0 };
    current.requestCount += item.requestCount;
    if (item.success) current.successCount += item.requestCount; else current.failureCount += item.requestCount;
    groups.set(item.provider, current);
  }
  return [...groups].map(([provider, value]) => ({ provider, ...value, successRate: value.requestCount ? round(value.successCount / value.requestCount) : 0 }));
}

function groupCosts<T>(items: T[], keyFor: (item: T) => string) { const groups = new Map<string, number>(); for (const item of items) groups.set(keyFor(item), (groups.get(keyFor(item)) ?? 0) + toCost(item as UsageLike)); return [...groups.values()]; }
function describeCosts(costs: number[]) { return { sampleSize: costs.length, averageCny: average(costs), p50Cny: percentile(costs, 0.5), p95Cny: percentile(costs, 0.95), totalCny: round(costs.reduce((sum, item) => sum + item, 0)) }; }
function sumCost(items: UsageLike[]) { return items.reduce((sum, item) => sum + toCost(item), 0); }
function toCost(item: UsageLike) { return Number(item.estimatedCostCny ?? 0); }
function average(values: number[]) { return values.length ? round(values.reduce((sum, item) => sum + item, 0) / values.length) : 0; }
function percentile(values: number[], point: number) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * point) - 1)] ?? 0); }
function round(value: number) { return Number(value.toFixed(6)); }
