"use client";

import type { PublicAnalyticsEvent } from "@/lib/analytics-schema";

type AnalyticsInput = Omit<PublicAnalyticsEvent, "anonymousSessionId">;

function getAnonymousSessionId() {
  const key = "realneed_anonymous_session_id";
  const existing = window.localStorage.getItem(key);
  if (existing && isUuid(existing)) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

export function recordAnalyticsEvent(input: AnalyticsInput) {
  if (typeof window === "undefined" || typeof crypto?.randomUUID !== "function") return;

  const body = JSON.stringify({
    ...input,
    anonymousSessionId: getAnonymousSessionId()
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
