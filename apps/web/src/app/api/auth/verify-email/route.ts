import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { ACCESS_COOKIE, REFRESH_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth/constants";
import { authCookieOptions } from "@/lib/auth/cookie-options";
import { requestedStorefront } from "@/lib/storefront.server";
import { attachThemeCookie } from "@/lib/theme/theme-cookie";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { code?: string; email?: string } | null;
  const code = body?.code?.trim() ?? "";
  const email = body?.email?.trim() ?? "";
  if (!/^\d{4}$/.test(code)) {
    return NextResponse.json({ message: "Enter the 4-digit code." }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ message: "Enter your email address." }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-storefront": await requestedStorefront(request.headers.get("x-storefront")),
  };
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers["user-agent"] = userAgent;

  const upstream = await fetch(`${getApiBaseUrl()}/auth/verify-email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code, email }),
  });
  const payload = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
  if (!upstream.ok) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  const tokens = payload.tokens as
    | { accessToken: string; refreshToken: string; accessTokenExpiresIn: number }
    | undefined;
  const user =
    payload.user && typeof payload.user === "object"
      ? (payload.user as { theme?: unknown })
      : undefined;
  const response = attachThemeCookie(NextResponse.json({ user: payload.user }), user?.theme);
  if (tokens) {
    response.cookies.set(ACCESS_COOKIE, tokens.accessToken, authCookieOptions(tokens.accessTokenExpiresIn));
    response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, authCookieOptions(SESSION_MAX_AGE_SEC));
  }
  return response;
}
