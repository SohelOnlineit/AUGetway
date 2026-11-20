import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";
import { attachThemeCookie } from "@/lib/theme/theme-cookie";

export async function GET() {
  const jar = await cookies();
  const upstream = await apiFetchWithAccessToken(
    "/account/profile",
    jar.get(ACCESS_COOKIE)?.value,
  );
  const payload = await upstream.json().catch(() => ({}));
  return attachThemeCookie(
    NextResponse.json(payload, { status: upstream.status }),
    payload && typeof payload === "object" ? (payload as { theme?: unknown }).theme : undefined,
  );
}

export async function PATCH(request: Request) {
  const jar = await cookies();
  const body = await request.text();
  const upstream = await apiFetchWithAccessToken(
    "/account/profile",
    jar.get(ACCESS_COOKIE)?.value,
    { method: "PATCH", body },
  );
  const payload = await upstream.json().catch(() => ({}));
  return attachThemeCookie(
    NextResponse.json(payload, { status: upstream.status }),
    payload && typeof payload === "object" ? (payload as { theme?: unknown }).theme : undefined,
  );
}
