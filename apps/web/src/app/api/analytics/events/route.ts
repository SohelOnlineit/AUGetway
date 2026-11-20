import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";

/** Public BFF proxy for privacy-conscious analytics (no auth cookies required). */
export async function POST(request: Request) {
  const body = await request.text();
  const upstream = await fetch(`${getApiBaseUrl()}/analytics/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
