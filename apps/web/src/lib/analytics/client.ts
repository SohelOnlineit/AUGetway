"use client";

import type { AnalyticsEventNamePublic } from "@amarpin/types";

const VISITOR_KEY = "uq_vid";

function visitorKey(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && existing.length >= 8) return existing;
    const created = `v_${crypto.randomUUID()}`;
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return `v_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }
}

/** Fire-and-forget privacy-conscious storefront event. Never send PII/tokens/chat. */
export function trackStorefrontEvent(input: {
  name: AnalyticsEventNamePublic;
  path?: string;
  entityType?: string;
  entityId?: string;
}): void {
  if (typeof window === "undefined") return;
  const payload = {
    name: input.name,
    path: input.path ?? window.location.pathname,
    entityType: input.entityType,
    entityId: input.entityId,
    visitorKey: visitorKey(),
  };
  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    /* ignore analytics failures */
  });
}

/** Refresh the anonymous live visitor count. No email, IP, or page text is sent. */
export function trackPresence(): void {
  if (typeof window === "undefined") return;
  void fetch("/api/analytics/presence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visitorKey: visitorKey() }),
    keepalive: true,
  }).catch(() => {
    /* ignore analytics failures */
  });
}
