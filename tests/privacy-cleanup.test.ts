import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { executeDataCleanup } from "../lib/data-cleanup";
import { hashToken } from "../lib/crypto-tokens";
import { prisma } from "../lib/prisma";
import { anonymizeReport } from "../lib/report-deletion";

const judgmentIds: string[] = [];
const cleanupRunIds: string[] = [];
const subjectHashes: string[] = [];
const cleanupNow = new Date("2020-07-12T12:00:00.000Z");

afterEach(async () => {
  if (judgmentIds.length) await prisma.ideaJudgmentRecord.deleteMany({ where: { id: { in: judgmentIds.splice(0) } } });
  if (cleanupRunIds.length) await prisma.dataCleanupRun.deleteMany({ where: { id: { in: cleanupRunIds.splice(0) } } });
  if (subjectHashes.length) await prisma.reportDeletionAudit.deleteMany({ where: { subjectHash: { in: subjectHashes.splice(0) } } });
});

describe("privacy cleanup", () => {
  it("dry-run reports candidates without modifying target data or creating an audit run", async () => {
    const fixture = await createExpiredFixture({ paid: false });
    const runsBefore = await prisma.dataCleanupRun.count();
    const result = await executeDataCleanup({ dryRun: true, now: cleanupNow });
    const [judgment, source, runsAfter] = await Promise.all([
      prisma.ideaJudgmentRecord.findUniqueOrThrow({ where: { id: fixture.judgmentId } }),
      prisma.sourceRecord.findUniqueOrThrow({ where: { id: fixture.sourceId } }),
      prisma.dataCleanupRun.count()
    ]);

    expect(result.anonymizedReportCount).toBeGreaterThanOrEqual(1);
    expect(judgment.deletedAt).toBeNull();
    expect(source.rawContent).toContain("private source body");
    expect(runsAfter).toBe(runsBefore);
  });

  it("anonymizes expired unpaid reports, revokes links, and removes sensitive relations", async () => {
    const fixture = await createExpiredFixture({ paid: false });
    const result = await executeDataCleanup({ dryRun: false, now: cleanupNow });
    await trackLatestCleanupRun();
    const [judgment, sourceCount, deepDiveCount, eventCount, audit] = await Promise.all([
      prisma.ideaJudgmentRecord.findUniqueOrThrow({ where: { id: fixture.judgmentId } }),
      prisma.sourceRecord.count({ where: { judgmentId: fixture.judgmentId } }),
      prisma.deepDiveReport.count({ where: { judgmentId: fixture.judgmentId } }),
      prisma.jobEvent.count({ where: { jobId: fixture.jobId } }),
      prisma.reportDeletionAudit.findFirst({ where: { subjectHash: subjectHash(fixture.judgmentId) }, orderBy: { createdAt: "desc" } })
    ]);

    expect(result.errorCount).toBe(0);
    expect(judgment.originalIdea).toBe("[deleted]");
    expect(judgment.recoveryTokenHash).toBeNull();
    expect(judgment.deletedAt).toBeInstanceOf(Date);
    expect(sourceCount).toBe(0);
    expect(deepDiveCount).toBe(0);
    expect(eventCount).toBe(0);
    expect(audit?.source).toBe("RETENTION_POLICY");
  });

  it("protects paid undelivered and generating orders from retention deletion", async () => {
    const paid = await createExpiredFixture({ paid: true, generationStatus: "READY", deliveryStatus: "NOT_SENT" });
    const generating = await createExpiredFixture({ paid: true, generationStatus: "GENERATING", deliveryStatus: "NOT_SENT" });
    const result = await executeDataCleanup({ dryRun: false, now: cleanupNow });
    await trackLatestCleanupRun();
    const [paidRecord, generatingRecord] = await Promise.all([
      prisma.ideaJudgmentRecord.findUniqueOrThrow({ where: { id: paid.judgmentId } }),
      prisma.ideaJudgmentRecord.findUniqueOrThrow({ where: { id: generating.judgmentId } })
    ]);

    expect(result.protectedReportCount).toBeGreaterThanOrEqual(2);
    expect(paidRecord.deletedAt).toBeNull();
    expect(generatingRecord.deletedAt).toBeNull();
    expect(paidRecord.paymentStatus).toBe("PAID");
  });

  it("clears old source content and old telemetry while keeping active report metadata", async () => {
    const fixture = await createActiveOldContentFixture();
    const result = await executeDataCleanup({ dryRun: false, now: cleanupNow });
    await trackLatestCleanupRun();
    const [judgment, source, analyticsCount, usageCount, job] = await Promise.all([
      prisma.ideaJudgmentRecord.findUniqueOrThrow({ where: { id: fixture.judgmentId } }),
      prisma.sourceRecord.findUniqueOrThrow({ where: { id: fixture.sourceId } }),
      prisma.analyticsEvent.count({ where: { id: fixture.analyticsId } }),
      prisma.apiUsageRecord.count({ where: { id: fixture.usageId } }),
      prisma.job.findUniqueOrThrow({ where: { id: fixture.jobId } })
    ]);

    expect(result.errorCount).toBe(0);
    expect(judgment.deletedAt).toBeNull();
    expect(source.rawContent).toBeNull();
    expect(source.excerpt).toBeNull();
    expect(source.qualifyingExcerpt).toBeNull();
    expect(analyticsCount).toBe(0);
    expect(usageCount).toBe(0);
    expect(job.progressJson).toEqual({});
  });

  it("is idempotent when the same cleanup window is executed again", async () => {
    await createExpiredFixture({ paid: false });
    const first = await executeDataCleanup({ dryRun: false, now: cleanupNow });
    const firstRun = await prisma.dataCleanupRun.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    cleanupRunIds.push(firstRun.id);
    const second = await executeDataCleanup({ dryRun: false, now: cleanupNow });
    const secondRun = await prisma.dataCleanupRun.findFirstOrThrow({ where: { id: { not: firstRun.id } }, orderBy: { createdAt: "desc" } });
    cleanupRunIds.push(secondRun.id);

    expect(first.anonymizedReportCount).toBeGreaterThanOrEqual(1);
    expect(second.anonymizedReportCount).toBe(0);
    expect(second.clearedSourceContentCount).toBe(0);
    expect(second.deletedAnalyticsCount).toBe(0);
  });

  it("user deletion invalidates recovery and paid links while retaining minimal payment audit", async () => {
    const fixture = await createExpiredFixture({ paid: true, generationStatus: "READY", deliveryStatus: "SENT" });
    const deletion = await anonymizeReport(fixture.judgmentId, "USER_REQUEST");
    const [judgment, recoveryMatch, deepDiveCount, audit] = await Promise.all([
      prisma.ideaJudgmentRecord.findUniqueOrThrow({ where: { id: fixture.judgmentId } }),
      prisma.ideaJudgmentRecord.count({ where: { recoveryTokenHash: hashToken(fixture.recoveryToken), deletedAt: null } }),
      prisma.deepDiveReport.count({ where: { judgmentId: fixture.judgmentId } }),
      prisma.reportDeletionAudit.findFirst({ where: { subjectHash: subjectHash(fixture.judgmentId) }, orderBy: { createdAt: "desc" } })
    ]);

    expect(deletion.found).toBe(true);
    expect(recoveryMatch).toBe(0);
    expect(deepDiveCount).toBe(0);
    expect(judgment.paymentStatus).toBe("PAID");
    expect(judgment.paidAt).toBeInstanceOf(Date);
    expect(judgment.deliveryStatus).toBe("REVOKED");
    expect(audit?.source).toBe("USER_REQUEST");
  });
});

async function createExpiredFixture(options: {
  paid: boolean;
  generationStatus?: "NOT_STARTED" | "QUEUED" | "GENERATING" | "READY" | "FAILED";
  deliveryStatus?: "NOT_SENT" | "SENT" | "REVOKED";
}) {
  const recoveryToken = `rn_recover_test_${Math.random().toString(36).slice(2)}_long_token`;
  const judgment = await prisma.ideaJudgmentRecord.create({
    data: {
      reportCode: uniqueCode("EXPIRED"),
      recoveryTokenHash: hashToken(recoveryToken),
      originalIdea: "private expired idea",
      judgmentJson: { originalIdea: "private expired idea" },
      technicalOutcome: "INSUFFICIENT_EVIDENCE",
      marketVerdict: "NOT_AVAILABLE",
      confidence: "VERY_LOW",
      paymentStatus: options.paid ? "PAID" : "UNPAID",
      paidAt: options.paid ? new Date("2019-01-01T00:00:00.000Z") : undefined,
      generationStatus: options.generationStatus ?? "READY",
      deliveryStatus: options.deliveryStatus ?? (options.paid ? "NOT_SENT" : "NOT_SENT"),
      expiresAt: new Date("2019-01-01T00:00:00.000Z"),
      createdAt: new Date("2018-01-01T00:00:00.000Z")
    }
  });
  judgmentIds.push(judgment.id);
  subjectHashes.push(subjectHash(judgment.id));
  const source = await prisma.sourceRecord.create({
    data: {
      judgmentId: judgment.id,
      originalUrl: "https://example.com/private",
      title: "private title",
      rawContent: "private source body",
      excerpt: "private excerpt",
      qualifyingExcerpt: "private qualifying excerpt",
      createdAt: new Date("2018-01-01T00:00:00.000Z")
    }
  });
  const deepDive = await prisma.deepDiveReport.create({
    data: { judgmentId: judgment.id, mode: "IDEA_SIGNAL_REPAIR", reportJson: { private: "report" }, createdAt: new Date("2018-01-01T00:00:00.000Z") }
  });
  await prisma.reportAccessLink.create({
    data: {
      deepDiveReportId: deepDive.id,
      tokenHash: createHash("sha256").update(uniqueCode("LINK")).digest("hex"),
      status: "ACTIVE",
      expiresAt: new Date("2019-01-01T00:00:00.000Z")
    }
  });
  const job = await prisma.job.create({
    data: {
      type: "JUDGMENT",
      entityId: judgment.id,
      status: "SUCCEEDED",
      stage: "completed",
      progressJson: { input: { idea: "private expired idea" } },
      completedAt: new Date("2018-01-01T00:00:00.000Z"),
      createdAt: new Date("2018-01-01T00:00:00.000Z")
    }
  });
  await prisma.jobEvent.create({ data: { jobId: job.id, eventType: "stage", eventJson: { message: "private" }, sequence: 1, createdAt: new Date("2018-01-01T00:00:00.000Z") } });
  return { judgmentId: judgment.id, sourceId: source.id, jobId: job.id, recoveryToken };
}

async function createActiveOldContentFixture() {
  const judgment = await prisma.ideaJudgmentRecord.create({
    data: {
      reportCode: uniqueCode("ACTIVE"),
      originalIdea: "active idea",
      judgmentJson: {},
      technicalOutcome: "INSUFFICIENT_EVIDENCE",
      marketVerdict: "NOT_AVAILABLE",
      confidence: "VERY_LOW",
      expiresAt: new Date("2021-01-01T00:00:00.000Z"),
      createdAt: new Date("2018-01-01T00:00:00.000Z")
    }
  });
  judgmentIds.push(judgment.id);
  const source = await prisma.sourceRecord.create({
    data: {
      judgmentId: judgment.id,
      originalUrl: "https://example.com/old",
      rawContent: "old body",
      excerpt: "old excerpt",
      qualifyingExcerpt: "old qualifying excerpt",
      createdAt: new Date("2018-01-01T00:00:00.000Z")
    }
  });
  const analytics = await prisma.analyticsEvent.create({
    data: { judgmentId: judgment.id, eventType: "old", createdAt: new Date("2018-01-01T00:00:00.000Z") }
  });
  const usage = await prisma.apiUsageRecord.create({
    data: { judgmentId: judgment.id, provider: "test", operation: "old", createdAt: new Date("2018-01-01T00:00:00.000Z") }
  });
  const job = await prisma.job.create({
    data: {
      type: "JUDGMENT",
      entityId: judgment.id,
      status: "SUCCEEDED",
      stage: "completed",
      progressJson: { input: "sensitive" },
      completedAt: new Date("2018-01-01T00:00:00.000Z"),
      createdAt: new Date("2018-01-01T00:00:00.000Z")
    }
  });
  return { judgmentId: judgment.id, sourceId: source.id, analyticsId: analytics.id, usageId: usage.id, jobId: job.id };
}

async function trackLatestCleanupRun() {
  const run = await prisma.dataCleanupRun.findFirst({ orderBy: { createdAt: "desc" } });
  if (run) cleanupRunIds.push(run.id);
}

function subjectHash(judgmentId: string) {
  return createHash("sha256").update(`realneed-deletion:${judgmentId}`).digest("hex");
}

function uniqueCode(prefix: string) {
  return `RN-TEST-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
