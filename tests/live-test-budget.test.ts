import { describe, expect, it } from "vitest";
import { assertLiveTestBudget, readLiveTestBudget } from "../lib/live-test-budget";

describe("live test budget gate", () => {
  it("blocks paid live tests when either budget is missing or zero", () => {
    expect(readLiveTestBudget({}).allowed).toBe(false);
    expect(readLiveTestBudget({ LIVE_TEST_MAX_COST_CNY: "5", COST_BENCHMARK_BUDGET_CNY: "0" }).allowed).toBe(false);
    expect(() => assertLiveTestBudget({ LIVE_TEST_MAX_COST_CNY: "", COST_BENCHMARK_BUDGET_CNY: "10" })).toThrow(/必须都大于 0/);
  });

  it("allows a live test only when both user-controlled budgets are positive", () => {
    expect(readLiveTestBudget({ LIVE_TEST_MAX_COST_CNY: "5", COST_BENCHMARK_BUDGET_CNY: "10" })).toEqual({
      allowed: true,
      liveTestMaxCostCny: 5,
      costBenchmarkBudgetCny: 10
    });
  });
});
