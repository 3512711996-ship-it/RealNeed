import { describe, expect, it } from "vitest";
import { calculateCostMetrics } from "../lib/cost-metrics";

describe("cost metrics", () => {
  it("separates user-provider usage from instance costs without revenue calculations", () => {
    const metrics = calculateCostMetrics({ judgmentCount: 2, readyCount: 1, insufficientCount: 1, failedJobs: 0, usage: [usage({ provider: "OPENAI", credentialSource: "USER_PROVIDED", estimatedCostCny: 0.6, deepDiveId: "d1", deepDiveReport: { mode: "IDEA_SIGNAL_REPAIR" } }), usage({ provider: "MOONSHOT", credentialSource: "PLATFORM", estimatedCostCny: 0.1 })] });
    expect(metrics.byokRequestCount).toBe(1);
    expect(metrics.userProviderEstimatedCostCny).toBe(0.6);
    expect(metrics.estimatedPlatformCostCny).toBe(0.1);
    expect("revenue" in metrics).toBe(false);
  });
});

function usage(overrides: Record<string, unknown>) { return { judgmentId: "j1", deepDiveId: null, provider: "test", operation: "test", requestCount: 1, creditsUsed: null, estimatedCostCny: null, success: true, errorCode: null, deepDiveReport: null, job: null, ...overrides }; }
