import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { ACCESS_COOKIE, REFRESH_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth/constants";
import { authCookieOptions } from "@/lib/auth/cookie-options";

export async function POST() {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const upstream = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  const payload = (await upstream.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!upstream.ok) {
    const response = NextResponse.json(payload, { status: upstream.status });
    response.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    response.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  }

  const tokens = payload.tokens as
    | {
        accessToken: string;
        refreshToken: string;
        accessTokenExpiresIn: number;
      }
    | undefined;

  const response = NextResponse.json({ user: payload.user });
  if (tokens) {
    response.cookies.set(
      ACCESS_COOKIE,
      tokens.accessToken,
      authCookieOptions(tokens.accessTokenExpiresIn),
    );
    response.cookies.set(
      REFRESH_COOKIE,
      tokens.refreshToken,
      authCookieOptions(SESSION_MAX_AGE_SEC),
    );
  }
  return response;
}
