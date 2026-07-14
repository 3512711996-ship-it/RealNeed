import { NextResponse } from "next/server";
import { requireAnonymousSession } from "@/lib/anonymous-session";
import { executionSelectionSchema } from "@/lib/api-connections-schema";
import { queueJudgment } from "@/lib/jobs";
import { assertRateLimit, getClientIp, RateLimitError } from "@/lib/rate-limit";
import { InputValidationError, validateInput } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireAnonymousSession(request, { requireCsrf: true });
    await assertRateLimit({
      key: `judgment:${session.ownerSessionHash}:${getClientIp(request)}`,
      limit: 8,
      windowMs: 60 * 60 * 1000,
      message: "今天的扫描请求有点密集，请稍后再试。"
    });

    const payload = await request.json();
    const input = validateInput(payload);
    const execution = parseExecutionSelection(payload);
    const queued = await queueJudgment(input, {
      ownerSessionHash: session.ownerSessionHash,
      execution
    });

    if ("clarification" in queued) {
      return NextResponse.json(queued.clarification);
    }

    return NextResponse.json(
      {
        status: "queued",
        ...queued
      },
      { status: 202 }
    );
  } catch (error) {
    const status = getErrorStatus(error);
    const message = error instanceof Error ? error.message : "扫描任务创建失败。";
    const headers = error instanceof RateLimitError ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;

    return NextResponse.json(
      {
        status: "error",
        message,
        warnings: ["系统已 fail-closed：没有使用本地模板硬生成判断报告。"]
      },
      { status, headers }
    );
  }
}

function parseExecutionSelection(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("execution" in payload)) return undefined;
  const parsed = executionSelectionSchema.safeParse((payload as { execution?: unknown }).execution);
  if (!parsed.success) {
    throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "API 供应商选择无效，请重新选择连接。"), { status: 400 });
  }
  return parsed.data;
}

function getErrorStatus(error: unknown) {
  if (error instanceof InputValidationError || error instanceof RateLimitError) return error.status;

  if (typeof error === "object" && error && "status" in error) {
    const status = Number((error as { status?: number }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }

  return 500;
}
