import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 over "<timestamp>.<body>", written as sha256=<hex>. */
export function signWebhook(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Extra headers for a webhook. With no secret saved the webhook goes out unsigned, as before. */
export function webhookHeaders(secret: string, body: string, now = Date.now()): Record<string, string> {
  if (!secret) return {};
  const timestamp = String(Math.floor(now / 1000));
  return { "x-webhook-timestamp": timestamp, "x-webhook-signature": signWebhook(secret, timestamp, body) };
}

/** What a shop's server does with the headers. Kept here so the rule is tested and can be copied into the docs. */
export function webhookIsGenuine(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
  now = Date.now(),
  toleranceSeconds = 300,
): boolean {
  const sent = Number(timestamp);
  if (!secret || !Number.isFinite(sent) || Math.abs(now / 1000 - sent) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhook(secret, timestamp, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
