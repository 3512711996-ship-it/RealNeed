import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  JobTimeoutError,
  claimJob,
  classifyJobFailure,
  computeRetryDelayMs,
  heartbeatJob,
  handleJobFailure,
  getJobWithEvents,
  recoverStaleJobs,
  runWithJobTimeout
} from "../lib/jobs";
import { prisma } from "../lib/prisma";

const judgmentIds: string[] = [];
const workerIds = ["test-worker-a", "test-worker-b", "test-worker-restarted"];

beforeAll(() => {
  process.env.JOB_EXECUTION_MODE = "worker";
});

afterEach(async () => {
  if (judgmentIds.length) await prisma.ideaJudgmentRecord.deleteMany({ where: { id: { in: judgmentIds.splice(0) } } });
  await prisma.workerNode.deleteMany({ where: { id: { in: workerIds } } });
});

describe("resilient worker", () => {
  it("allows only one worker to atomically claim the same job", async () => {
    const job = await createJob();
    const [first, second] = await Promise.all([claimJob(job.id, workerIds[0]), claimJob(job.id, workerIds[1])]);
    const claims = [first, second].filter(Boolean);

    expect(claims).toHaveLength(1);
    expect(claims[0]?.status).toBe("RUNNING");
    expect(claims[0]?.attemptCount).toBe(1);
    expect(claims[0]?.leaseExpiresAt).toBeInstanceOf(Date);
  });

  it("updates heartbeat and extends the active lease", async () => {
    const job = await createJob();
    const claimed = await claimJob(job.id, workerIds[0]);
    expect(claimed).not.toBeNull();
    const oldLease = claimed?.leaseExpiresAt?.getTime() ?? 0;

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await heartbeatJob(job.id, workerIds[0])).toBe(true);
    const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.heartbeatAt).toBeInstanceOf(Date);
    expect(updated.leaseExpiresAt?.getTime()).toBeGreaterThan(oldLease);
  });

  it("does not expose a job or its events to another anonymous session", async () => {
    const job = await createJob({ ownerSessionHash: "owner-session-hash" });
    await prisma.jobEvent.create({ data: { jobId: job.id, eventType: "deep_dive_ready", eventJson: { reportUrl: "/deep-dive/private" }, sequence: 1 } });
    const owner = await getJobWithEvents(job.id, "owner-session-hash");
    const stranger = await getJobWithEvents(job.id, "other-session-hash");
    expect(owner.job?.id).toBe(job.id);
    expect(owner.events).toHaveLength(1);
    expect(stranger.job).toBeNull();
    expect(stranger.events).toHaveLength(0);
  });

  it("recovers a stale running job and lets a restarted worker claim it", async () => {
    const job = await createJob({ maxAttempts: 2 });
    await claimJob(job.id, workerIds[0]);
    await expireLease(job.id);

    const recovery = await recoverStaleJobs(new Date());
    expect(recovery.requeued).toBe(1);
    const reclaimed = await claimJob(job.id, workerIds[2]);
    expect(reclaimed?.status).toBe("RUNNING");
    expect(reclaimed?.attemptCount).toBe(2);
    const event = await prisma.jobEvent.findFirst({ where: { jobId: job.id, eventType: "recovered_stale_job" } });
    expect(event).not.toBeNull();
  });

  it("fails a stale job after max attempts without clearing paid status", async () => {
    const job = await createJob({ type: "DEEP_DIVE", maxAttempts: 1, paid: true });
    await claimJob(job.id, workerIds[0]);
    await expireLease(job.id);

    const recovery = await recoverStaleJobs(new Date());
    const [updatedJob, judgment] = await Promise.all([
      prisma.job.findUniqueOrThrow({ where: { id: job.id } }),
      prisma.ideaJudgmentRecord.findUniqueOrThrow({ where: { id: job.entityId! } })
    ]);
    expect(recovery.failed).toBe(1);
    expect(updatedJob.status).toBe("FAILED");
    expect(updatedJob.lastErrorCode).toBe("RECOVERED_STALE_JOB");
    expect(judgment.paymentStatus).toBe("PAID");
    expect(judgment.generationStatus).toBe("FAILED");
  });

  it("classifies retryable and permanent failures and applies bounded exponential backoff", () => {
    expect(classifyJobFailure(Object.assign(new Error("Tavily rate limited"), { status: 429, code: "TAVILY_429" })).retryable).toBe(true);
    expect(classifyJobFailure(Object.assign(new Error("schema validation failed"), { status: 422, code: "SCHEMA_INVALID" })).retryable).toBe(false);
    expect(computeRetryDelayMs(1, () => 0)).toBe(1000);
    expect(computeRetryDelayMs(3, () => 0)).toBe(4000);
    expect(computeRetryDelayMs(20, () => 1)).toBeLessThanOrEqual(75_000);
  });

  it("requeues retryable failures but permanently fails schema errors", async () => {
    const retryJob = await createJob({ maxAttempts: 2 });
    const retryClaim = await claimJob(retryJob.id, workerIds[0]);
    await handleJobFailure(
      retryClaim!,
      workerIds[0],
      Object.assign(new Error("Tavily temporary rate limit"), { status: 429, code: "TAVILY_429" })
    );
    const requeued = await prisma.job.findUniqueOrThrow({ where: { id: retryJob.id } });
    expect(requeued.status).toBe("QUEUED");
    expect(requeued.stage).toBe("retry_wait");
    expect(requeued.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    const permanentJob = await createJob({ maxAttempts: 3 });
    const permanentClaim = await claimJob(permanentJob.id, workerIds[1]);
    await handleJobFailure(
      permanentClaim!,
      workerIds[1],
      Object.assign(new Error("schema validation failed"), { status: 422, code: "SCHEMA_INVALID" })
    );
    const failed = await prisma.job.findUniqueOrThrow({ where: { id: permanentJob.id } });
    expect(failed.status).toBe("FAILED");
    expect(failed.attemptCount).toBe(1);
  });

  it("aborts the timeout signal and rejects with an explicit timeout error", async () => {
    const job = await createJob();
    const claimed = await claimJob(job.id, workerIds[0]);
    expect(claimed).not.toBeNull();
    let aborted = false;
    const timedJob = { ...claimed!, timeoutAt: new Date(Date.now() + 20) };

    await expect(
      runWithJobTimeout(timedJob, (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
          setTimeout(resolve, 200);
        })
      )
    ).rejects.toBeInstanceOf(JobTimeoutError);
    expect(aborted).toBe(true);
  });
});

async function createJob(options: { type?: "JUDGMENT" | "DEEP_DIVE"; maxAttempts?: number; paid?: boolean; ownerSessionHash?: string } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const judgment = await prisma.ideaJudgmentRecord.create({
    data: {
      reportCode: `RN-WORKER-${suffix}`,
      originalIdea: "worker test",
      judgmentJson: {},
      technicalOutcome: "PROCESSING_FAILED",
      marketVerdict: "NOT_AVAILABLE",
      confidence: "VERY_LOW",
      paymentStatus: options.paid ? "PAID" : "UNPAID",
      paidAt: options.paid ? new Date() : undefined,
      generationStatus: options.type === "DEEP_DIVE" ? "GENERATING" : "NOT_STARTED"
    }
  });
  judgmentIds.push(judgment.id);
  return prisma.job.create({
    data: {
      type: options.type ?? "JUDGMENT",
      entityId: judgment.id,
      status: "QUEUED",
      stage: "QUEUED",
      maxAttempts: options.maxAttempts ?? 2
      ,ownerSessionHash: options.ownerSessionHash ?? null
    }
  });
}

async function expireLease(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      leaseExpiresAt: new Date(Date.now() - 60_000),
      heartbeatAt: new Date(Date.now() - 60_000),
      lockedAt: new Date(Date.now() - 60_000)
    }
  });
}
