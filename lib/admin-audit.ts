import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { toJson } from "@/lib/judgment-persistence";

export async function recordAdminAudit(input: {
  request: Request;
  action: string;
  orderId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
}) {
  const requestId = safeRequestId(input.request.headers.get("x-request-id")) ?? randomUUID();
  await prisma.adminAuditLog.create({
    data: {
      adminId: "owner",
      action: input.action,
      orderId: input.orderId,
      oldValue: input.oldValue === undefined ? undefined : toJson(input.oldValue),
      newValue: input.newValue === undefined ? undefined : toJson(input.newValue),
      reason: input.reason?.slice(0, 500),
      requestId
    }
  });
  return requestId;
}

function safeRequestId(value: string | null) {
  const clean = value?.trim();
  return clean && /^[A-Za-z0-9._:-]{6,120}$/.test(clean) ? clean : null;
}
