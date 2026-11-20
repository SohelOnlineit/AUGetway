import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { ACCESS_COOKIE } from "@/lib/auth/constants";
import { authCookieOptions } from "@/lib/auth/cookie-options";
import { GUEST_COOKIE } from "@/lib/auth/shopper";

const GUEST_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export async function proxyChat(path: string, init: RequestInit = {}, createGuest = false) {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  if (access) {
    const upstream = await apiFetchWithAccessToken(path, access, init);
    const payload = await upstream.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstream.status });
  }

  const settings = await fetch(`${getApiBaseUrl()}/storefront/live-chat`, { cache: "no-store" });
  const flags = (await settings.json().catch(() => null)) as { guestChat?: boolean } | null;
  if (!settings.ok || flags?.guestChat === false) {
    return NextResponse.json({ message: "Sign in to chat" }, { status: 401 });
  }

  let guest = jar.get(GUEST_COOKIE)?.value;
  let created: string | null = null;
  if (!guest) {
    if (!createGuest) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    guest = randomUUID();
    created = guest;
  }

  const headers = new Headers(init.headers);
  headers.set("x-guest-token", guest);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  const upstream = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers, cache: "no-store" });
  const payload = await upstream.json().catch(() => ({}));
  const response = NextResponse.json(payload, { status: upstream.status });
  if (created && upstream.ok) {
    response.cookies.set(GUEST_COOKIE, created, authCookieOptions(GUEST_MAX_AGE_SEC));
  }
  return response;
}
