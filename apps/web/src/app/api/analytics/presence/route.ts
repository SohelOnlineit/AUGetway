import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip");
}

/** Public BFF proxy for the anonymous live visitor heartbeat. */
export async function POST(request: Request) {
  const body = await request.text();
  const ip = clientIp(request);
  const upstream = await fetch(`${getApiBaseUrl()}/analytics/presence`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ip ? { "x-forwarded-for": ip } : {}),
    },
    body,
    cache: "no-store",
  });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
