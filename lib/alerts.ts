import { getServerEnv } from "@/lib/env";
import { logServerError } from "@/lib/safe-logger";

export async function sendOperationalAlert(input: {
  event: string;
  errorCode: string;
  severity: "warning" | "critical";
  context?: Record<string, string | number | boolean | null>;
}) {
  const webhookUrl = getServerEnv().alertWebhookUrl;
  if (!webhookUrl) return { sent: false, reason: "ALERT_WEBHOOK_NOT_CONFIGURED" as const };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: "realneed",
        event: input.event.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100),
        errorCode: input.errorCode.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100),
        severity: input.severity,
        occurredAt: new Date().toISOString(),
        context: input.context ?? {}
      }),
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) throw Object.assign(new Error("ALERT_WEBHOOK_HTTP_ERROR"), { code: `HTTP_${response.status}` });
    return { sent: true as const };
  } catch (error) {
    logServerError("alert_delivery_failed", error, { alertEvent: input.event });
    return { sent: false, reason: "ALERT_DELIVERY_FAILED" as const };
  }
}
