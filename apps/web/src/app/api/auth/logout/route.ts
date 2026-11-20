import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { authCookieOptions } from "@/lib/auth/cookie-options";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/constants";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { refreshToken?: string } | null;
  const refreshToken =
    body?.refreshToken?.trim() ||
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${REFRESH_COOKIE}=`))
      ?.slice(REFRESH_COOKIE.length + 1);

  await fetch(`${getApiBaseUrl()}/auth/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      refreshToken: refreshToken
        ? decodeURIComponent(refreshToken)
        : undefined,
    }),
  }).catch(() => undefined);

  const contentType = request.headers.get("content-type") ?? "";
  const isForm =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");
  const response = isForm
    ? new NextResponse(null, { status: 303, headers: { location: "/login" } })
    : NextResponse.json({ message: "Signed out" });
  const cleared = authCookieOptions(0);
  response.cookies.set(ACCESS_COOKIE, "", cleared);
  response.cookies.set(REFRESH_COOKIE, "", cleared);
  return response;
}
