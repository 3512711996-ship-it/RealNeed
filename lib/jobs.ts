import { Prisma, type Job } from "@prisma/client";
import { generateDeepDiveReport } from "@/lib/deep-dive-generator";
import { buildDeepDiveEligibility, deepDiveModeLabel, parseDeepDiveMode } from "@/lib/deep-dive-eligibility";
import { buildReportGenerationEligibility } from "@/lib/report-generation-eligibility";
import { replaceReportAccessLink } from "@/lib/report-access-links";
import { getServerEnv } from "@/lib/env";
import { generateIdeaJudgment, needsClarification, type JudgmentProgressEvent } from "@/lib/judgment-engine";
import { createPendingJudgmentRecord, saveIdeaJudgment, toJson } from "@/lib/judgment-persistence";
import { prisma } from "@/lib/prisma";
import type { AnalyzeRequest, DeepDiveMode, IdeaJudgment, JobEventPayload } from "@/lib/types";
import { isBillableUsage } from "@/lib/usage-tracker";
import { runWithJobAbortSignal } from "@/lib/job-abort-context";
import { executeDataCleanup } from "@/lib/data-cleanup";
import { logServerError } from "@/lib/safe-logger";
import { sendOperationalAlert } from "@/lib/alerts";
import type { ExecutionSelection } from "@/lib/api-connections-schema";
import { executionSelectionSchema } from "@/lib/api-connections-schema";
import { runWithProviderExecutionContext } from "@/lib/provider-execution-context";
import {
  defaultSearchExecutionConfig,
  parseGenerationExecutionConfig,
  parseSearchExecutionConfig,
  type GenerationExecutionConfig
} from "@/lib/providers/execution-config";
import { ProviderExecutionError } from "@/lib/providers/shared-errors";
import { isWorkerAvailable } from "@/lib/worker-availability";

type JudgmentJobPayload = {
  input: AnalyzeRequest;
};

type DeepDiveJobPayload = {
  reportCode: string;
  mode: DeepDiveMode;
};

type JobFailureDecision = {
  retryable: boolean;
  code: string;
};

export class JobTimeoutError extends Error {
  code = "JOB_TIMEOUT";

  constructor(jobId: string) {
    super(`后台任务 ${jobId} 超过允许执行时间。`);
    this.name = "JobTimeoutError";
  }
}

export class JobLeaseLostError extends Error {
  code = "JOB_LEASE_LOST";

  constructor(jobId: string) {
    super(`后台任务 ${jobId} 的执行租约已失效。`);
    this.name = "JobLeaseLostError";
  }
}

export type QueuedJudgment = {
  judgmentId: string;
  reportCode: string;
  recoveryUrl: string;
  jobId: string;
};

export async function queueJudgment(
  input: AnalyzeRequest,
  options: { ownerSessionHash?: string | null; execution?: ExecutionSelection } = {}
): Promise<QueuedJudgment | { clarification: NonNullable<ReturnType<typeof needsClarification>> }> {
  assertProductionJobMode();
  if (!(await isWorkerAvailable())) {
    throw Object.assign(new Error("后台 Worker 当前不可用，暂时不能创建判断任务。"), { status: 503, code: "WORKER_UNAVAILABLE" });
  }
  const clarification = needsClarification(input.idea, input.clarificationAnswers);
  if (clarification) return { clarification };

  if (!options.execution) {
    throw Object.assign(new Error("请先连接自己的搜索 API 和生成模型 API。RealNeed 不会在未选择凭据时静默使用平台 Key。"), { status: 409, code: "BYOK_CONFIGURATION_REQUIRED" });
  }
  const execution = executionSelectionSchema.parse(options.execution);
  if (execution.generation.credentialSource !== "USER_PROVIDED" && !getServerEnv().allowInstanceApiForReports) {
    throw Object.assign(new Error("请先选择自己的生成模型 API。"), { status: 409, code: "GENERATION_BYOK_REQUIRED" });
  }
  if (input.mode === "auto_search" && execution.search.credentialSource !== "USER_PROVIDED") {
    throw Object.assign(new Error("自动搜索需要选择自己的搜索 API。"), { status: 409, code: "SEARCH_BYOK_REQUIRED" });
  }
  await assertExecutionSelectionOwnership(options.ownerSessionHash ?? null, execution);
  const pending = await createPendingJudgmentRecord({ originalIdea: input.idea });
  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        type: "JUDGMENT",
        entityId: pending.judgmentId,
        status: "QUEUED",
        stage: "QUEUED",
        progressJson: toJson({ input } satisfies JudgmentJobPayload),
        ownerSessionHash: options.ownerSessionHash ?? null,
        searchExecutionConfig: toJson(execution.search),
        generationExecutionConfig: toJson(execution.generation)
      },
      select: { id: true }
    });
    await createCredentialBindings(tx, created.id, execution);
    return created;
  });

  await appendJobEvent(job.id, { type: "stage", stage: "queued", message: "判断任务已进入后台队列" });
  maybeRunInline(job.id);

  return {
    judgmentId: pending.judgmentId,
    reportCode: pending.reportCode,
    recoveryUrl: pending.recoveryUrl,
    jobId: job.id
  };
}

export type QueueDeepDiveOptions = {
  ownerSessionHash: string;
  mode?: DeepDiveMode;
  generation: GenerationExecutionConfig;
};

/** Queues a free BYOK report. Payment state is intentionally never read or written. */
export async function queueDeepDive(reportCode: string, options: QueueDeepDiveOptions) {
  assertProductionJobMode();
  if (!(await isWorkerAvailable())) {
    throw Object.assign(new Error("后台 Worker 当前不可用，暂时不能创建报告任务。"), { status: 503, code: "WORKER_UNAVAILABLE" });
  }
  const record = await prisma.ideaJudgmentRecord.findUnique({
    where: { reportCode },
    select: {
      id: true,
      reportCode: true,
      generationStatus: true,
      technicalOutcome: true,
      marketVerdict: true,
      confidence: true,
      purchasedDeepDiveMode: true,
      judgmentJson: true,
      deepDiveReport: { select: { id: true } }
    }
  });

  if (!record) {
    throw Object.assign(new Error("没有找到这份免费判断报告。"), { status: 404 });
  }

  const judgment = {
    ...(record.judgmentJson as unknown as IdeaJudgment),
    judgmentId: record.id,
    reportCode: record.reportCode,
    technicalOutcome: record.technicalOutcome,
    marketVerdict: record.marketVerdict,
    confidence: record.confidence,
    generationStatus: record.generationStatus,
    purchasedDeepDiveMode: record.purchasedDeepDiveMode
  } satisfies IdeaJudgment;
  const conceptualEligibility = buildDeepDiveEligibility(judgment);
  const mode = options.mode ?? conceptualEligibility.mode;

  if (!mode) {
    throw Object.assign(new Error(conceptualEligibility.reason), { status: 409, eligibility: conceptualEligibility });
  }

  if (!conceptualEligibility.canPurchase || conceptualEligibility.mode !== mode) {
    throw Object.assign(new Error(conceptualEligibility.reason), { status: 409, eligibility: conceptualEligibility });
  }

  if (record.generationStatus === "GENERATING" || record.generationStatus === "QUEUED") {
    const running = await prisma.job.findFirst({
      where: { entityId: record.id, type: "DEEP_DIVE", status: { in: ["QUEUED", "RUNNING", "WAITING_FOR_CREDENTIAL"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
    return { jobId: running?.id, reused: true };
  }

  const judgmentJob = await prisma.job.findFirst({
    where: { entityId: record.id, type: "JUDGMENT", status: "SUCCEEDED" },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: {
      ownerSessionHash: true,
      searchExecutionConfig: true,
      generationExecutionConfig: true,
      credentialBindings: {
        select: {
          credentialId: true,
          purpose: true,
          providerSnapshot: true,
          modelSnapshot: true,
          credentialSource: true,
          configurationVersion: true
        }
      }
    }
  });
  const inheritedSearchExecution = parseSearchExecutionConfig(judgmentJob?.searchExecutionConfig ?? defaultSearchExecutionConfig);
  if (judgmentJob?.ownerSessionHash && judgmentJob.ownerSessionHash !== options.ownerSessionHash) {
    throw Object.assign(new Error("这份判断报告不属于当前浏览器会话。请使用原恢复链接继续。"), { status: 403 });
  }
  const generation = options.generation;
  const reportEligibility = buildReportGenerationEligibility(judgment, generation.credentialSource === "USER_PROVIDED" ? "ACTIVE" : "MISSING");
  if (!reportEligibility.eligible || reportEligibility.reportMode !== mode) {
    throw Object.assign(new Error(reportEligibility.reason), { status: 409, eligibility: reportEligibility });
  }
  if (generation.credentialSource !== "USER_PROVIDED" && !getServerEnv().allowInstanceApiForReports) {
    throw Object.assign(new Error("免费 Deep Dive 必须使用你自己的生成模型 API。"), { status: 409 });
  }
  await assertExecutionSelectionOwnership(options.ownerSessionHash, { search: inheritedSearchExecution, generation });

  const job = await prisma.$transaction(async (tx) => {
    await tx.ideaJudgmentRecord.update({
      where: { id: record.id },
      data: {
        purchasedDeepDiveMode: mode,
        deepDiveEligibilityJson: toJson(reportEligibility),
        generationStatus: "QUEUED",
        generationError: null
      }
    });
    const created = await tx.job.create({
      data: {
        type: "DEEP_DIVE",
        entityId: record.id,
        status: "QUEUED",
        stage: "QUEUED",
        progressJson: toJson({ reportCode, mode } satisfies DeepDiveJobPayload),
        ownerSessionHash: options.ownerSessionHash,
        searchExecutionConfig: toJson(inheritedSearchExecution),
        generationExecutionConfig: toJson(generation),
        maxAttempts: 2
      },
      select: { id: true }
    });
    await createCredentialBindings(tx, created.id, { search: inheritedSearchExecution, generation });
    return created;
  });

  await appendJobEvent(job.id, { type: "stage", stage: "queued", message: `${deepDiveModeLabel(mode)}已进入生成队列` });
  await recordAnalyticsEvent("free_deep_dive_queued", record.id, undefined, { mode, generationProvider: generation.provider });
  maybeRunInline(job.id);

  return { jobId: job.id, reused: false };
}

export async function retryDeepDive(reportCode: string, options: QueueDeepDiveOptions) {
  await prisma.ideaJudgmentRecord.updateMany({ where: { reportCode }, data: { generationStatus: "FAILED", generationError: null } });
  return queueDeepDive(reportCode, options);
}

export async function queueDataCleanup() {
  const existing = await prisma.job.findFirst({
    where: { type: "DATA_CLEANUP", status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });
  if (existing) return { jobId: existing.id, reused: true };
  const job = await prisma.job.create({
    data: {
      type: "DATA_CLEANUP",
      entityId: null,
      status: "QUEUED",
      stage: "QUEUED",
      progressJson: { dryRun: false },
      maxAttempts: 3
    },
    select: { id: true }
  });
  await appendJobEvent(job.id, { type: "stage", stage: "queued", message: "数据清理任务已进入后台队列" });
  maybeRunInline(job.id);
  return { jobId: job.id, reused: false };
}

export async function appendJobEvent(jobId: string, event: JobEventPayload | JudgmentProgressEvent) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await appendJobEventOnce(jobId, event);
      return;
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableJobEventWriteError(error)) throw error;
      await sleep(150 * attempt);
    }
  }
}

async function appendJobEventOnce(jobId: string, event: JobEventPayload | JudgmentProgressEvent) {
  await prisma.$transaction(
    async (tx) => {
      const job = await tx.job.update({
        where: { id: jobId },
        data: { nextEventSequence: { increment: 1 } },
        select: { nextEventSequence: true }
      });
      const sequence = job.nextEventSequence;

      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: event.type,
          eventJson: toJson(event),
          sequence
        }
      });

      if (event.type === "stage") {
        await tx.job.update({
          where: { id: jobId },
          data: { stage: event.stage }
        });
      }
    },
    { maxWait: 15000, timeout: 20000 }
  );
}

export async function getJobWithEvents(jobId: string, ownerSessionHash: string, afterSequence = 0) {
  const job = await prisma.job.findFirst({
      where: { id: jobId, ownerSessionHash },
      select: {
        id: true,
        type: true,
        entityId: true,
        status: true,
        stage: true,
        attemptCount: true,
        maxAttempts: true,
        lockedBy: true,
        leaseExpiresAt: true,
        heartbeatAt: true,
        nextAttemptAt: true,
        timeoutAt: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
  const events = job
    ? await prisma.jobEvent.findMany({ where: { jobId, sequence: { gt: afterSequence } }, orderBy: { sequence: "asc" } })
    : [];

  return { job, events };
}

export async function resumeJobWithCredential(jobId: string, ownerSessionHash: string, execution: ExecutionSelection) {
  assertProductionJobMode();
  const parsedExecution = executionSelectionSchema.parse(execution);
  await assertExecutionSelectionOwnership(ownerSessionHash, parsedExecution);

  const resumed = await prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({
      where: { id: jobId },
      select: { id: true, ownerSessionHash: true, status: true, type: true, progressJson: true }
    });
    if (!job || job.ownerSessionHash !== ownerSessionHash) {
      throw Object.assign(new Error("没有找到属于当前会话的后台任务。"), { status: 404 });
    }
    if (job.status !== "WAITING_FOR_CREDENTIAL") {
      throw Object.assign(new Error("这个任务当前不需要更新 API 连接。"), { status: 409 });
    }
    const mode = job.type === "DEEP_DIVE" ? parseDeepDiveMode((job.progressJson as DeepDiveJobPayload | null)?.mode) : null;
    if (job.type === "DEEP_DIVE" && parsedExecution.generation.credentialSource !== "USER_PROVIDED" && !getServerEnv().allowInstanceApiForReports) {
      throw Object.assign(new Error("免费 Deep Dive 必须继续使用你自己的生成模型 API。"), { status: 409 });
    }
    if (job.type === "JUDGMENT" && parsedExecution.generation.credentialSource !== "USER_PROVIDED" && !getServerEnv().allowInstanceApiForReports) {
      throw Object.assign(new Error("判断任务必须继续使用你自己的生成模型 API。"), { status: 409 });
    }
    if (job.type === "JUDGMENT" && parsedExecution.search.credentialSource !== "USER_PROVIDED") {
      const payload = job.progressJson as JudgmentJobPayload | null;
      if (payload?.input.mode === "auto_search") throw Object.assign(new Error("自动搜索任务必须继续使用你自己的搜索 API。"), { status: 409 });
    }
    if (job.type === "DEEP_DIVE" && !mode) throw Object.assign(new Error("Deep Dive 缺少报告模式，不能继续。"), { status: 422 });

    await tx.jobCredentialBinding.deleteMany({ where: { jobId } });
    await tx.job.update({
      where: { id: jobId },
      data: {
        status: "QUEUED",
        stage: "QUEUED",
        searchExecutionConfig: toJson(parsedExecution.search),
        generationExecutionConfig: toJson(parsedExecution.generation),
        executionCheckpointJson: toJson({ resumedAt: new Date().toISOString(), reason: "USER_CREDENTIAL_UPDATED" }),
        nextAttemptAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        timeoutAt: null
      }
    });
    await createCredentialBindings(tx, jobId, parsedExecution);
    return { jobId, status: "queued" as const };
  });

  await appendJobEvent(jobId, {
    type: "stage",
    stage: "queued",
    message: "API 连接已更新，任务已重新进入队列。"
  });
  maybeRunInline(jobId);
  return resumed;
}

export async function processNextJob() {
  await recoverStaleJobs();
  const job = await claimNextJob();
  if (!job) return false;
  await runClaimedJob(job);
  return true;
}

export async function processJobById(jobId: string) {
  const job = await claimJob(jobId);
  if (!job) return false;
  await runClaimedJob(job);
  return true;
}

export async function claimNextJob(workerId = getServerEnv().workerId) {
  return claimJobAtomically(undefined, workerId);
}

export async function claimJob(jobId: string, workerId = getServerEnv().workerId) {
  return claimJobAtomically(jobId, workerId);
}

async function claimJobAtomically(jobId: string | undefined, workerId: string) {
  const env = getServerEnv();
  const idPredicate = jobId ? Prisma.sql`AND "id" = ${jobId}` : Prisma.empty;
  const rows = await prisma.$transaction((tx) =>
    tx.$queryRaw<Job[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "id"
        FROM "Job"
        WHERE "status" = 'QUEUED'::"JobStatus"
          AND "nextAttemptAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          AND "attemptCount" < "maxAttempts"
          ${idPredicate}
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "Job" AS job
      SET
        "status" = 'RUNNING'::"JobStatus",
        "stage" = 'running',
        "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "lockedBy" = ${workerId},
        "leaseExpiresAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + (${env.jobLockTimeoutSeconds} * INTERVAL '1 second'),
        "heartbeatAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "startedAt" = COALESCE(job."startedAt", (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')),
        "timeoutAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + (
          CASE job."type"
            WHEN 'JUDGMENT'::"JobType" THEN ${env.judgmentJobTimeoutSeconds}
            WHEN 'DEEP_DIVE'::"JobType" THEN ${env.deepDiveJobTimeoutSeconds}
            WHEN 'DATA_CLEANUP'::"JobType" THEN ${env.dataCleanupJobTimeoutSeconds}
            ELSE ${env.jobMaxRuntimeSeconds}
          END * INTERVAL '1 second'
        ),
        "attemptCount" = job."attemptCount" + 1,
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job.*
    `)
  );
  const claimed = rows[0] ?? null;
  if (claimed) {
    await heartbeatWorker(workerId, claimed.id, { claimed: true });
  }
  return claimed;
}

async function runClaimedJob(job: Job | null) {
  if (!job) return;

  const workerId = job.lockedBy ?? getServerEnv().workerId;
  const heartbeatEveryMs = Math.max(1000, Math.floor((getServerEnv().jobLockTimeoutSeconds * 1000) / 3));
  let leaseLost = false;
  const heartbeatTimer = setInterval(() => {
    heartbeatJob(job.id, workerId).then((alive) => {
      if (!alive) leaseLost = true;
    }).catch(() => {
      leaseLost = true;
    });
  }, heartbeatEveryMs);

  try {
    await runWithProviderExecutionContext(job, () => runWithJobTimeout(job, (signal) => executeClaimedJob(job, signal)));
    if (leaseLost) throw new JobLeaseLostError(job.id);
    const completed = await prisma.job.updateMany({
      where: { id: job.id, status: "RUNNING", lockedBy: workerId },
      data: {
        status: "SUCCEEDED",
        stage: "completed",
        completedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        timeoutAt: null
      }
    });
    if (completed.count !== 1) throw new JobLeaseLostError(job.id);
    await heartbeatWorker(workerId, null, { succeeded: true });
  } catch (error) {
    await handleJobFailure(job, workerId, error);
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function executeClaimedJob(job: Job, signal: AbortSignal) {
  signal.throwIfAborted();
  if (job.type === "JUDGMENT") return runJudgmentJob(job, signal);
  if (job.type === "DEEP_DIVE") return runDeepDiveJob(job, signal);
  if (job.type === "DATA_CLEANUP") return runDataCleanupJob(job, signal);
  throw Object.assign(new Error(`不支持的任务类型：${job.type}`), { code: "UNSUPPORTED_JOB", status: 422 });
}

export async function handleJobFailure(job: Job, workerId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "后台任务失败";
  const decision = classifyJobFailure(error);
  const errorId = logServerError("job_execution_failed", error, {
    jobType: job.type,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts
  });
  const userMessage = sanitizeJobError(message, errorId);
  if (error instanceof ProviderExecutionError && error.actionRequired && isUserCredentialJob(job)) {
    await pauseJobForCredential(job, workerId, error);
    return;
  }
  const canRetry = decision.retryable && job.attemptCount < job.maxAttempts && !(error instanceof JobLeaseLostError);

  if (canRetry) {
    const nextAttemptAt = new Date(Date.now() + computeRetryDelayMs(job.attemptCount));
    const updated = await prisma.job.updateMany({
      where: { id: job.id, status: "RUNNING", lockedBy: workerId },
      data: {
        status: "QUEUED",
        stage: "retry_wait",
        nextAttemptAt,
        lastErrorCode: decision.code,
        lastErrorMessage: userMessage.slice(0, 1000),
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        timeoutAt: null
      }
    });
    if (updated.count === 1) {
      if (job.type === "DEEP_DIVE" && job.entityId) {
        await prisma.ideaJudgmentRecord.updateMany({
          where: { id: job.entityId },
          data: { generationStatus: "QUEUED", generationError: userMessage.slice(0, 1000) }
        });
      }
      await appendJobEvent(job.id, {
        type: "retry_scheduled",
        stage: "retry_wait",
        message: `临时故障，任务将在稍后重试（${job.attemptCount}/${job.maxAttempts}）。`,
        code: decision.code,
        nextAttemptAt: nextAttemptAt.toISOString(),
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts
      });
      await heartbeatWorker(workerId, null, { failed: true });
      maybeRunInline(job.id, Math.max(0, nextAttemptAt.getTime() - Date.now()) + 25);
    }
    return;
  }

  await appendJobEvent(job.id, { type: "error", stage: job.stage, message: userMessage, code: decision.code }).catch(() => undefined);
  await markDomainJobFailure(job, decision.code, userMessage, errorId);
  await prisma.job.updateMany({
    where: { id: job.id, status: "RUNNING", lockedBy: workerId },
    data: {
      status: "FAILED",
      stage: "failed",
      lastErrorCode: decision.code,
      lastErrorMessage: userMessage.slice(0, 1000),
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      timeoutAt: null
    }
  });
  await heartbeatWorker(workerId, null, { failed: true });
  await sendOperationalAlert({
    event: "job_failed_permanently",
    errorCode: decision.code,
    severity: job.type === "DEEP_DIVE" ? "critical" : "warning",
    context: { jobType: job.type, attemptCount: job.attemptCount }
  });
}

async function markDomainJobFailure(job: Job, code: string, userMessage: string, errorId: string) {
  if (job.type === "DEEP_DIVE" && job.entityId) {
    await prisma.ideaJudgmentRecord.updateMany({
      where: { id: job.entityId },
      data: { generationStatus: "FAILED", generationError: userMessage.slice(0, 1000) }
    });
    await recordAnalyticsEvent("deep_dive_failed", job.entityId, undefined, { errorCode: code, message: userMessage.slice(0, 240) });
  }
  if (job.type === "JUDGMENT" && job.entityId) {
    const technicalOutcome = code.includes("SEARCH") ? "SEARCH_FAILED" : /KIMI|QUERY|INTERPRET|ANALYSIS/i.test(code) ? "ANALYSIS_FAILED" : "PROCESSING_FAILED";
    await prisma.ideaJudgmentRecord.updateMany({
      where: { id: job.entityId },
      data: {
        technicalOutcome,
        marketVerdict: "NOT_AVAILABLE",
        confidence: "VERY_LOW",
        judgmentJson: toJson({
          technicalOutcome,
          marketVerdict: "NOT_AVAILABLE",
          confidence: "VERY_LOW",
          warnings: [`后台判断失败，错误编号：${errorId}。系统没有使用本地 fallback 硬生成。`],
          error: userMessage
        })
      }
    });
  }
}

export async function heartbeatJob(jobId: string, workerId: string) {
  const leaseExpiresAt = new Date(Date.now() + getServerEnv().jobLockTimeoutSeconds * 1000);
  const updated = await prisma.job.updateMany({
    where: { id: jobId, status: "RUNNING", lockedBy: workerId, leaseExpiresAt: { gt: new Date() } },
    data: { heartbeatAt: new Date(), leaseExpiresAt }
  });
  if (updated.count === 1) await heartbeatWorker(workerId, jobId);
  return updated.count === 1;
}

export async function heartbeatWorker(
  workerId: string,
  currentJobId: string | null,
  flags: { claimed?: boolean; succeeded?: boolean; failed?: boolean } = {}
) {
  const now = new Date();
  await prisma.workerNode.upsert({
    where: { id: workerId },
    create: {
      id: workerId,
      heartbeatAt: now,
      currentJobId,
      lastClaimedAt: flags.claimed ? now : undefined,
      lastSucceededAt: flags.succeeded ? now : undefined,
      lastFailedAt: flags.failed ? now : undefined
    },
    update: {
      heartbeatAt: now,
      currentJobId,
      lastClaimedAt: flags.claimed ? now : undefined,
      lastSucceededAt: flags.succeeded ? now : undefined,
      lastFailedAt: flags.failed ? now : undefined
    }
  });
}

export async function recoverStaleJobs(now = new Date()) {
  const stale = await prisma.job.findMany({
    where: { status: "RUNNING", OR: [{ leaseExpiresAt: { lt: now } }, { leaseExpiresAt: null, lockedAt: { lt: new Date(now.getTime() - getServerEnv().jobLockTimeoutSeconds * 1000) } }] },
    orderBy: { createdAt: "asc" },
    take: 50
  });
  let requeued = 0;
  let failed = 0;

  for (const job of stale) {
    const nextStatus = job.attemptCount < job.maxAttempts ? "QUEUED" : "FAILED";
    const updated = await prisma.job.updateMany({
      where: { id: job.id, status: "RUNNING", lockedBy: job.lockedBy },
      data: {
        status: nextStatus,
        stage: nextStatus === "QUEUED" ? "recovered_retry" : "failed",
        nextAttemptAt: now,
        lastErrorCode: "RECOVERED_STALE_JOB",
        lastErrorMessage: "Worker 租约过期，任务已由恢复器接管。",
        completedAt: nextStatus === "FAILED" ? now : null,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        timeoutAt: null
      }
    });
    if (updated.count !== 1) continue;
    if (nextStatus === "QUEUED") requeued += 1;
    else failed += 1;
    if (job.type === "DEEP_DIVE" && job.entityId) {
      await prisma.ideaJudgmentRecord.updateMany({
        where: { id: job.entityId },
        data: {
          generationStatus: nextStatus === "QUEUED" ? "QUEUED" : "FAILED",
          generationError: nextStatus === "FAILED" ? "后台 Worker 多次失联，报告生成已停止。" : null
        }
      });
    }
    await appendJobEvent(job.id, {
      type: "recovered_stale_job",
      stage: nextStatus === "QUEUED" ? "recovered_retry" : "failed",
      message: nextStatus === "QUEUED" ? "检测到失联 Worker，任务已重新排队。" : "检测到失联 Worker，任务已达到最大尝试次数。",
      code: "RECOVERED_STALE_JOB",
      nextStatus
    });
  }
  return { examined: stale.length, requeued, failed };
}

export function computeRetryDelayMs(attemptCount: number, random = Math.random) {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, attemptCount - 1));
  const jitter = Math.floor(base * 0.25 * random());
  return base + jitter;
}

export function classifyJobFailure(error: unknown): JobFailureDecision {
  const code = getErrorCode(error);
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 0;
  const message = error instanceof Error ? error.message : String(error);
  const explicitlyPermanent =
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 422 ||
    /Zod|schema|invalid input|API key|security|SSRF|cost|budget|deleted|UNSUPPORTED_JOB/i.test(`${code} ${message}`);
  if (explicitlyPermanent) return { retryable: false, code };
  const retryable =
    error instanceof JobTimeoutError ||
    status === 429 ||
    status >= 500 ||
    /P1001|P1002|P1008|P2024|P2028|429|5\d\d|ECONNRESET|ETIMEDOUT|fetch failed|network|connection|temporar/i.test(`${code} ${message}`);
  return { retryable, code };
}

export async function runWithJobTimeout<T>(job: Job, task: (signal: AbortSignal) => Promise<T>) {
  const timeoutAt = job.timeoutAt?.getTime() ?? Date.now() + getServerEnv().jobMaxRuntimeSeconds * 1000;
  const remainingMs = Math.max(1, timeoutAt - Date.now());
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      runWithJobAbortSignal(controller.signal, () => task(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const timeoutError = new JobTimeoutError(job.id);
          reject(timeoutError);
          controller.abort(timeoutError);
        }, remainingMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sanitizeJobError(message: string, errorId: string) {
  if (/(\.next|Prisma|DATABASE_URL|D:\\|C:\\|server\\chunks|invocation|SQL|postgresql:)/i.test(message)) {
    return `后台任务失败。错误编号：${errorId}。请稍后重试或检查服务端日志。`;
  }
  return `${message.slice(0, 240)}（错误编号：${errorId}）`;
}

async function runJudgmentJob(job: Job, signal: AbortSignal) {
  if (!job.entityId) throw Object.assign(new Error("判断任务缺少关联报告。"), { status: 422, code: "INVALID_JOB_PAYLOAD" });
  const payload = job.progressJson as JudgmentJobPayload | null;
  const input = payload?.input;

  if (!input) {
    throw new Error("判断任务缺少输入。");
  }

  const record = await prisma.ideaJudgmentRecord.findUnique({ where: { id: job.entityId }, select: { id: true, reportCode: true } });
  if (!record) throw new Error("判断记录不存在。");

  const run = await prisma.judgmentRun.create({
    data: {
      judgmentId: record.id,
      jobId: job.id,
      stage: "judgment",
      status: "RUNNING",
      startedAt: new Date()
    },
    select: { id: true }
  });

  await appendJobEvent(job.id, { type: "stage", stage: "interpreting", message: "正在理解你的想法" });
  signal.throwIfAborted();
  const judgment = await generateIdeaJudgment(
    input,
    (event) => (signal.aborted ? Promise.resolve() : appendJobEvent(job.id, event)),
    { judgmentId: record.id, jobId: job.id }
  );
  signal.throwIfAborted();
  const saved = await saveIdeaJudgment({ ...judgment, reportCode: record.reportCode }, { existingId: record.id });

  await prisma.judgmentRun.update({
    where: { id: run.id },
    data: {
      stage: "completed",
      status: "SUCCEEDED",
      verificationCoverage: toJson(saved.verificationCoverage ?? {}),
      independentEvidenceCount: saved.independentEvidenceCount ?? 0,
      completedAt: new Date()
    }
  });

  await appendJobEvent(job.id, { type: "report_saved", judgmentId: record.id, reportCode: record.reportCode });
  await appendJobEvent(job.id, { type: "completed", judgmentId: record.id });
}

async function runDeepDiveJob(job: Job, signal: AbortSignal) {
  if (!job.entityId) throw Object.assign(new Error("Deep Dive 任务缺少关联报告。"), { status: 422, code: "INVALID_JOB_PAYLOAD" });
  const payload = job.progressJson as DeepDiveJobPayload | null;
  const payloadMode = parseDeepDiveMode(payload?.mode);

  await prisma.ideaJudgmentRecord.update({
    where: { id: job.entityId },
    data: { generationStatus: "GENERATING", generationError: null }
  });

  const record = await prisma.ideaJudgmentRecord.findUnique({
    where: { id: job.entityId },
    include: { deepDiveReport: true }
  });
  if (!record) throw new Error("判断记录不存在。");
  const mode = parseDeepDiveMode(record.purchasedDeepDiveMode) ?? payloadMode;
  if (!mode) throw new Error("Deep Dive 缺少已锁定的报告类型。");
  await appendJobEvent(job.id, { type: "stage", stage: "deep_dive_generating", message: `正在生成${deepDiveModeLabel(mode)}` });

  const judgment = {
    ...(record.judgmentJson as unknown as IdeaJudgment),
    judgmentId: record.id,
    reportCode: record.reportCode,
    technicalOutcome: record.technicalOutcome,
    marketVerdict: record.marketVerdict,
    confidence: record.confidence,
    generationStatus: record.generationStatus,
    purchasedDeepDiveMode: mode
  } satisfies IdeaJudgment;
  const eligibility = buildReportGenerationEligibility(
    judgment,
    parseGenerationExecutionConfig(job.generationExecutionConfig).credentialSource === "USER_PROVIDED" ? "ACTIVE" : "MISSING"
  );
  if (!eligibility.eligible || eligibility.reportMode !== mode) {
    throw new Error(`当前状态不能生成${deepDiveModeLabel(mode)}：${eligibility.reason}`);
  }

  // User-provided providers bill the user directly; instance budget limits only
  // apply to explicitly enabled instance-key deployments.
  if (parseGenerationExecutionConfig(job.generationExecutionConfig).credentialSource === "PLATFORM") {
    await assertDeepDiveCostBudget(record.id);
  }

  signal.throwIfAborted();
  const report = await generateDeepDiveReport(judgment, record.id, mode, { judgmentId: record.id, jobId: job.id });
  signal.throwIfAborted();
  const stillRunning = await prisma.job.findFirst({ where: { id: job.id, status: "RUNNING", lockedBy: job.lockedBy }, select: { id: true } });
  if (!stillRunning) throw new JobLeaseLostError(job.id);
  const savedReport = await prisma.deepDiveReport.upsert({
    where: { judgmentId: record.id },
    create: {
      judgmentId: record.id,
      mode,
      reportJson: toJson(report),
      generatedAt: parseReportDate(report.generatedAt)
    },
    update: {
      mode,
      reportJson: toJson(report),
      generatedAt: parseReportDate(report.generatedAt)
    },
    select: { id: true }
  });

  await prisma.apiUsageRecord.updateMany({
    where: { jobId: job.id, deepDiveId: null },
    data: { deepDiveId: savedReport.id }
  });

  const access = await replaceReportAccessLink(savedReport.id);
  await prisma.ideaJudgmentRecord.update({
    where: { id: record.id },
    data: { generationStatus: "READY", generationError: null, deepDiveEligibilityJson: toJson(eligibility) }
  });

  await recordAnalyticsEvent("deep_dive_generated", record.id, savedReport.id, { mode });

  await appendJobEvent(job.id, {
    type: "stage",
    stage: "deep_dive_ready",
    message: "Deep Dive 已生成，私有访问链接已创建。"
  });
  await appendJobEvent(job.id, { type: "deep_dive_ready", reportId: savedReport.id, reportUrl: access.reportUrl, mode });
  await appendJobEvent(job.id, { type: "completed", judgmentId: record.id });
}

async function runDataCleanupJob(job: Job, signal: AbortSignal) {
  signal.throwIfAborted();
  await appendJobEvent(job.id, { type: "stage", stage: "cleanup_running", message: "正在执行数据保留与隐私清理" });
  const result = await executeDataCleanup({ dryRun: false, jobId: job.id });
  signal.throwIfAborted();
  if (result.errorCount > 0) {
    throw Object.assign(new Error(`数据清理部分失败：${result.errorSummary.join("；")}`), {
      code: "DATA_CLEANUP_PARTIAL",
      status: 503
    });
  }
  await appendJobEvent(job.id, {
    type: "stage",
    stage: "cleanup_completed",
    message: `数据清理完成：匿名化 ${result.anonymizedReportCount} 份报告，清理 ${result.clearedSourceContentCount} 条正文。`
  });
}

async function assertDeepDiveCostBudget(judgmentId: string) {
  const env = getServerEnv();
  const usage = await prisma.apiUsageRecord.findMany({
    where: { judgmentId },
    select: { estimatedCostCny: true, success: true, errorCode: true }
  });
  const used = usage.reduce((sum, item) => sum + (isBillableUsage(item.success, item.errorCode) ? Number(item.estimatedCostCny ?? 0) : 0), 0);
  if (used > env.deepDiveMaxCostCny) {
    throw new Error(`当前报告 API 成本估算已达到 ${used.toFixed(3)} 元，超过 Deep Dive 预算上限 ${env.deepDiveMaxCostCny} 元，已停止生成。`);
  }
}

function parseReportDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function maybeRunInline(jobId: string, delayMs = 0) {
  const env = getServerEnv();
  if (env.jobExecutionMode !== "inline") return;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境禁止使用 inline Job；请启动独立 Worker 并设置 JOB_EXECUTION_MODE=worker。");
  }
  setTimeout(() => {
    processJobById(jobId).catch(() => undefined);
  }, Math.min(Math.max(0, delayMs), 2_147_483_647));
}

function isUserCredentialJob(job: Job) {
  return parseCredentialSource(job.searchExecutionConfig) === "USER_PROVIDED" || parseCredentialSource(job.generationExecutionConfig) === "USER_PROVIDED";
}

function parseCredentialSource(value: Prisma.JsonValue) {
  if (value && typeof value === "object" && !Array.isArray(value) && "credentialSource" in value) {
    return String((value as { credentialSource?: unknown }).credentialSource);
  }
  return "PLATFORM";
}

async function pauseJobForCredential(job: Job, workerId: string, error: ProviderExecutionError) {
  await prisma.job.updateMany({
    where: { id: job.id, status: "RUNNING", lockedBy: workerId },
    data: {
      status: "WAITING_FOR_CREDENTIAL",
      stage: "waiting_for_credential",
      lastErrorCode: error.code,
      lastErrorMessage: error.safeMessage,
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      timeoutAt: null
    }
  });
  if (job.type === "DEEP_DIVE" && job.entityId) {
    await prisma.ideaJudgmentRecord.updateMany({
      where: { id: job.entityId },
      data: { generationStatus: "QUEUED", generationError: error.safeMessage }
    });
  }
  await appendJobEvent(job.id, {
    type: "error",
    stage: "waiting_for_credential",
    message: "你的 API 连接需要更新。任务已暂停，没有切换到 RealNeed 平台 API。",
    code: error.code
  });
  await heartbeatWorker(workerId, null, { failed: true });
}

async function assertExecutionSelectionOwnership(ownerSessionHash: string | null, execution: ExecutionSelection) {
  const selected: Array<
    | { id: string | null; kind: "SEARCH"; provider: ExecutionSelection["search"]["provider"] }
    | { id: string | null; kind: "GENERATION"; provider: ExecutionSelection["generation"]["provider"] }
  > = [];
  if (execution.search.credentialSource === "USER_PROVIDED") {
    selected.push({ id: execution.search.credentialId, kind: "SEARCH", provider: execution.search.provider });
  }
  if (execution.generation.credentialSource === "USER_PROVIDED") {
    selected.push({ id: execution.generation.credentialId, kind: "GENERATION", provider: execution.generation.provider });
  }

  if (!selected.length) return;
  if (!ownerSessionHash || selected.some((item) => !item.id)) {
    throw Object.assign(new Error("使用自己的 API 时必须选择当前会话已连接的凭据。"), { status: 409 });
  }
  const credentials = await prisma.apiCredential.findMany({
    where: {
      id: { in: selected.map((item) => item.id as string) },
      ownerSessionHash,
      status: "ACTIVE",
      expiresAt: { gt: new Date() }
    },
    select: { id: true, kind: true, provider: true }
  });
  for (const expected of selected) {
    if (!credentials.some((item) => item.id === expected.id && item.kind === expected.kind && item.provider === expected.provider)) {
      throw Object.assign(new Error("所选 API 连接不属于当前会话、已过期或供应商不匹配。"), { status: 403 });
    }
  }
}

async function createCredentialBindings(tx: Prisma.TransactionClient, jobId: string, execution: ExecutionSelection) {
  const bindings: Prisma.JobCredentialBindingCreateManyInput[] = [];
  if (execution.search.credentialSource === "USER_PROVIDED" && execution.search.credentialId) {
    bindings.push({ jobId, credentialId: execution.search.credentialId, purpose: "SEARCH", providerSnapshot: execution.search.provider, credentialSource: "USER_PROVIDED", configurationVersion: execution.search.configurationVersion });
  }
  if (execution.generation.credentialSource === "USER_PROVIDED" && execution.generation.credentialId) {
    bindings.push({ jobId, credentialId: execution.generation.credentialId, purpose: "GENERATION", providerSnapshot: execution.generation.provider, modelSnapshot: execution.generation.model, credentialSource: "USER_PROVIDED", configurationVersion: execution.generation.configurationVersion });
  }
  if (bindings.length) await tx.jobCredentialBinding.createMany({ data: bindings });
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error && (error as { code?: unknown }).code) return String((error as { code?: unknown }).code);
  if (typeof error === "object" && error && "name" in error) return String((error as { name?: string }).name);
  return "JOB_FAILED";
}

export function assertProductionJobMode() {
  if (process.env.NODE_ENV === "production" && getServerEnv().jobExecutionMode !== "worker") {
    throw Object.assign(new Error("生产环境未启用独立 Worker，暂不接受后台任务。"), { status: 503, code: "WORKER_MODE_REQUIRED" });
  }
}

function isRetryableJobEventWriteError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === "P1001" ||
    code === "P2028" ||
    /Unable to start a transaction|Can't reach database server|connection|timeout/i.test(message)
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return toJson(value);
}

async function recordAnalyticsEvent(eventType: string, judgmentId: string, deepDiveReportId?: string, properties?: Record<string, string | number | boolean | null>) {
  try {
    await prisma.analyticsEvent.create({
      data: {
        eventType,
        judgmentId,
        deepDiveReportId,
        propertiesJson: properties ?? {}
      }
    });
  } catch {
    // Analytics must not affect judgment or paid report generation.
  }
}
