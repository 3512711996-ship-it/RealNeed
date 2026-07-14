import { afterEach, describe, expect, it } from "vitest";
import { POST } from "../app/api/analytics/route";
import { prisma } from "../lib/prisma";

const eventIds: string[] = [];

afterEach(async () => {
  if (eventIds.length) await prisma.analyticsEvent.deleteMany({ where: { id: { in: eventIds.splice(0) } } });
});

describe("analytics API abuse controls", () => {
  it("writes one valid allowlisted event", async () => {
    const response = await POST(
      request({
        eventType: "today_action_completed",
        anonymousSessionId: crypto.randomUUID(),
        properties: { mode: "HYPOTHESIS_VALIDATION", evidenceSourceCount: 0 }
      })
    );
    expect(response.status).toBe(200);
    const event = await prisma.analyticsEvent.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    eventIds.push(event.id);
    expect(event.eventType).toBe("today_action_completed");
  });

  it("rejects unknown events and sensitive extra fields before database write", async () => {
    const before = await prisma.analyticsEvent.count();
    const response = await POST(
      request({
        eventType: "custom_event",
        anonymousSessionId: crypto.randomUUID(),
        originalIdea: "完整用户想法",
        recoveryToken: "rn_recovery_abcdefghijklmnopqrstuvwxyz",
        wechat: "private-contact"
      })
    );
    expect(response.status).toBe(400);
    expect(await prisma.analyticsEvent.count()).toBe(before);
  });

  it("rejects bodies above 4 KB", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": "5000" },
        body: "{}"
      })
    );
    expect(response.status).toBe(413);
  });
});

function request(body: unknown) {
  return new Request("http://localhost:3000/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `198.51.100.${Math.floor(Math.random() * 200) + 1}` },
    body: JSON.stringify(body)
  });
}
