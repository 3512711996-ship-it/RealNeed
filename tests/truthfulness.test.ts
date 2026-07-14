import { describe, expect, it } from "vitest";
import { appendJobEvent } from "../lib/jobs";
import { prisma } from "../lib/prisma";
import { parseSearchQueryPlan } from "../lib/query-generator";
import { verifySource } from "../lib/source-verifier";

describe("truthfulness boundaries", () => {
  it("rejects Kimi query plans that contain generated URLs", () => {
    expect(() =>
      parseSearchQueryPlan({
        queries: [
          {
            query: "site:reddit.com expense tracker too complicated",
            market: "OVERSEAS",
            intent: "PAIN",
            url: "https://reddit.com/r/fake/comments/abc"
          }
        ]
      })
    ).toThrow();
  });

  it("normalizes ambiguous Kimi market and intent enum output without accepting URLs", () => {
    const parsed = parseSearchQueryPlan({
      queries: [
        {
          query: "知乎 ptcg 卡片评分 工具",
          market: "DOMESTIC | OVERSEAS",
          intent: "PAIN | WORKAROUND | PAYMENT | COMPETITOR"
        },
        {
          query: "site:reddit.com ptcg card grading app alternative",
          market: "DOMESTIC | OVERSEAS",
          intent: "PAIN | WORKAROUND | PAYMENT | COMPETITOR"
        }
      ]
    });

    expect(parsed.queries[0]?.market).toBe("DOMESTIC");
    expect(parsed.queries[0]?.intent).toBe("PAIN");
    expect(parsed.queries[1]?.market).toBe("OVERSEAS");
    expect(parsed.queries[1]?.intent).toBe("COMPETITOR");
  });

  it("blocks private network URLs in source verification", async () => {
    const result = await verifySource("http://127.0.0.1:12345/private");
    expect(result.isAccessible).toBe(false);
    expect(result.failureReason).toMatch(/内网|localhost|metadata|private/i);
  });

  it("writes 20 concurrent JobEvents without duplicate sequence", async () => {
    const jobId = await createTestJob("RN-TEST-JOB20");
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => appendJobEvent(jobId, { type: "stage", stage: `test-${index}`, message: "test" }))
    );
    const events = await prisma.jobEvent.findMany({ where: { jobId }, orderBy: { sequence: "asc" } });
    expect(new Set(events.map((event) => event.sequence)).size).toBe(20);
    expect(events[0]?.sequence).toBe(1);
    expect(events.at(-1)?.sequence).toBe(20);
    await cleanupJob(jobId);
  }, 30000);

  it("writes 100 concurrent JobEvents without duplicate sequence", async () => {
    const jobId = await createTestJob("RN-TEST-JOB100");
    await Promise.all(
      Array.from({ length: 100 }, (_, index) => appendJobEvent(jobId, { type: "stage", stage: `test-${index}`, message: "test" }))
    );
    const events = await prisma.jobEvent.findMany({ where: { jobId }, orderBy: { sequence: "asc" } });
    expect(new Set(events.map((event) => event.sequence)).size).toBe(100);
    expect(events[0]?.sequence).toBe(1);
    expect(events.at(-1)?.sequence).toBe(100);
    await cleanupJob(jobId);
  }, 60000);
});

async function createTestJob(reportCodePrefix: string) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const record = await prisma.ideaJudgmentRecord.create({
    data: {
      reportCode: `${reportCodePrefix}-${suffix}`,
      originalIdea: "test idea",
      interpretedIdea: "test",
      judgmentJson: {},
      technicalOutcome: "PROCESSING_FAILED",
      marketVerdict: "NOT_AVAILABLE",
      confidence: "VERY_LOW"
    },
    select: { id: true }
  });
  const job = await prisma.job.create({
    data: {
      type: "JUDGMENT",
      entityId: record.id,
      status: "QUEUED",
      stage: "test"
    },
    select: { id: true }
  });
  return job.id;
}

async function cleanupJob(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { entityId: true } });
  if (!job?.entityId) return;
  await prisma.ideaJudgmentRecord.delete({ where: { id: job.entityId } });
}
