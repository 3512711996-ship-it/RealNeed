import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/judgments/e2e-repair", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ judgment: repairJudgment() }) });
  });
  await page.route("**/api/api-connections", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        csrfToken: "e2e-csrf-token",
        credentials: [{ id: "generation-credential", kind: "GENERATION", provider: "MOONSHOT", status: "ACTIVE", keyLastFour: "1234", selectedModel: "kimi-k2.5" }]
      })
    });
  });
  await page.route("**/api/analytics", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
});

test("evidence gap shows a free BYOK repair report without payment traffic", async ({ page }) => {
  let paymentRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/payment") || request.url().includes("confirm-payment")) paymentRequests += 1;
  });

  await page.goto("/results?judgmentId=e2e-repair");

  await expect(page.getByText("Free BYOK Deep Dive")).toBeVisible({ timeout: 30_000 });

  await page.locator("button[data-cursor='view']").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("select")).toHaveValue("generation-credential");
  await expect(dialog.locator("a[href='/api-connections']")).toBeVisible();
  await expect(dialog.getByRole("button").last()).toBeEnabled();
  expect(paymentRequests).toBe(0);
});

test("free BYOK repair modal stays usable on mobile", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Mobile coverage runs on mobile projects only.");

  await page.goto("/results?judgmentId=e2e-repair");
  await page.locator("button[data-cursor='view']").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

function repairJudgment() {
  return {
    judgmentId: "e2e-repair",
    reportCode: "RN-E2E-REPAIR",
    originalIdea: "AI bookkeeping assistant",
    interpretedIdea: "A narrow bookkeeping workflow for freelancers",
    technicalOutcome: "INSUFFICIENT_EVIDENCE",
    marketVerdict: "NOT_AVAILABLE",
    confidence: "VERY_LOW",
    verdict: "VALIDATE_FIRST",
    verdictText: "Evidence is insufficient",
    verdictReason: "No qualifying independent evidence was confirmed.",
    canShowOverallScore: false,
    qualifyingIndependentEvidenceCount: 0,
    scores: { demandSignal: 0, paymentSignal: 0, beginnerFeasibility: 0, mvpSimplicity: 0, distributionAccess: 0, overall: 0 },
    searchQueries: ["expense tracking too complicated"],
    scannedSources: [],
    accessibleSources: [],
    inaccessibleSources: [],
    strongSignals: [],
    mediumSignals: [],
    weakSignals: [],
    irrelevantSources: [],
    opportunities: [],
    warnings: [],
    scanStats: { queryCount: 1, candidateCount: 0, checkedCount: 0, totalCount: 0, accessibleCount: 0, inaccessibleCount: 0, classifiedCount: 0, strongCount: 0, mediumCount: 0, weakCount: 0, irrelevantCount: 0, opportunityCount: 0 },
    todayAction: {
      mode: "HYPOTHESIS_VALIDATION",
      title: "Validate the evidence gap",
      description: "Find real user complaints before building.",
      targetUserSearch: { keywords: [], platforms: [], whyTheseKeywords: "No claim is made without evidence." },
      tasks: [],
      successMetric: { metric: "Two concrete complaints", reasoning: "Independent evidence is required." },
      stopCondition: { condition: "No specific scenario", reasoning: "Do not create an opportunity." },
      outreachScript: { publicComment: "How do you handle this today?", directMessage: "What is the most repetitive part?" },
      evidenceSummary: { confirmedContentCount: 0, independentEvidenceCount: 0, sourceTitles: [], reasoning: ["No verified evidence"], confidence: "VERY_LOW" },
      evidenceSourceIds: []
    },
    deepDiveOffer: {
      canPurchase: true,
      mode: "IDEA_SIGNAL_REPAIR",
      reason: "A free repair report can map the evidence gap.",
      blockers: [],
      evidenceStats: { confirmedContentCount: 0, independentEvidenceCount: 0, strongOrMediumCount: 0 }
    }
  };
}
