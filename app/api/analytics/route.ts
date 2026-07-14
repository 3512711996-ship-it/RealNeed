import { NextResponse } from "next/server";
import { PublicAnalyticsEventSchema } from "@/lib/analytics-schema";
import { prisma } from "@/lib/prisma";
import {
  assertRateLimit,
  getClientIp,
  isRateLimitError,
  RateLimitError
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const maxBodyBytes = 4096;

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    await assertRateLimit({
      key: `analytics-ip:${clientIp}`,
      limit: 60,
      windowMs: 60 * 1000,
      message: "Analytics 请求过于频繁。"
    });

    const rawBody = await readLimitedBody(request, maxBodyBytes);
    const parsed = PublicAnalyticsEventSchema.safeParse(parseJson(rawBody));
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    await assertRateLimit({
      key: `analytics-session:${parsed.data.anonymousSessionId}`,
      limit: 24,
      windowMs: 60 * 1000,
      message: "Analytics 事件提交过于频繁。"
    });

    await prisma.analyticsEvent.create({
      data: {
        eventType: parsed.data.eventType,
        anonymousSessionId: parsed.data.anonymousSessionId,
        judgmentId: parsed.data.judgmentId,
        deepDiveReportId: parsed.data.deepDiveReportId,
        propertiesJson: parsed.data.properties
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }
    if (isRateLimitError(error)) {
      const headers = error instanceof RateLimitError ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
      return NextResponse.json({ ok: false }, { status: error.status, headers });
    }
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

class BodyTooLargeError extends Error {}

async function readLimitedBody(request: Request, maxBytes: number) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new BodyTooLargeError();

  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
