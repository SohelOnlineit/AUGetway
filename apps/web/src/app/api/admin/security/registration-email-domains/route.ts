import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";

/**
 * Explicit route so this path always proxies to Nest (avoids any catch-all resolution quirks).
 * Nest: GET|PUT /api/admin/security/registration-email-domains
 */
async function proxyAdminSecurityRegistrationDomains(request: Request) {
  const jar = await cookies();
  const url = new URL(request.url);
  const search = url.search || "";
  const target = `/admin/security/registration-email-domains${search}`;

  const headers: Record<string, string> = {};
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers["user-agent"] = userAgent;

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const upstream = await apiFetchWithAccessToken(target, jar.get(ACCESS_COOKIE)?.value, init);
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

export const GET = proxyAdminSecurityRegistrationDomains;
export const PUT = proxyAdminSecurityRegistrationDomains;
