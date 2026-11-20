import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { requestedStorefront } from "@/lib/storefront.server";

export async function POST(request: Request) {
  const body = await request.json();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-storefront": await requestedStorefront(request.headers.get("x-storefront")),
  };
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers["user-agent"] = userAgent;

  const upstream = await fetch(`${getApiBaseUrl()}/auth/register`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
