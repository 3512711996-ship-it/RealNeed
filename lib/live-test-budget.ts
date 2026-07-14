export type LiveTestBudget = {
  allowed: boolean;
  liveTestMaxCostCny: number;
  costBenchmarkBudgetCny: number;
  reason?: string;
};

export function readLiveTestBudget(env: Record<string, string | undefined> = process.env): LiveTestBudget {
  const liveTestMaxCostCny = parsePositiveBudget(env.LIVE_TEST_MAX_COST_CNY);
  const costBenchmarkBudgetCny = parsePositiveBudget(env.COST_BENCHMARK_BUDGET_CNY);
  if (liveTestMaxCostCny <= 0 || costBenchmarkBudgetCny <= 0) {
    return {
      allowed: false,
      liveTestMaxCostCny,
      costBenchmarkBudgetCny,
      reason: "LIVE_TEST_MAX_COST_CNY 和 COST_BENCHMARK_BUDGET_CNY 必须都大于 0，才能执行新增 Tavily/Kimi live test。"
    };
  }
  return { allowed: true, liveTestMaxCostCny, costBenchmarkBudgetCny };
}

export function assertLiveTestBudget(env: Record<string, string | undefined> = process.env) {
  const budget = readLiveTestBudget(env);
  if (!budget.allowed) {
    throw Object.assign(new Error(budget.reason), { code: "LIVE_TEST_BUDGET_REQUIRED", status: 412 });
  }
  return budget;
}

function parsePositiveBudget(value: string | undefined) {
  const parsed = Number(value?.trim() ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
