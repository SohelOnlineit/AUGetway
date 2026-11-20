import { cookies, headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requestedStorefront } from "@/lib/storefront.server";
import { getApiBaseUrl } from "./api-base";
import { apiFetchWithAccessToken } from "./api-client";
import { ACCESS_COOKIE } from "./constants";
import { authCookieOptions } from "./cookie-options";
import { guestOrdersEnabled } from "./guest-orders";

export const GUEST_COOKIE = "uq_guest";
const GUEST_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export async function shopperFetch(
  path: string,
  init: RequestInit = {},
  options: { createGuest?: boolean } = {},
): Promise<{ upstream: Response; setGuestToken: string | null }> {
  const incoming = await nextHeaders();
  const bearer = /^Bearer\s+(\S+)/i.exec(incoming.get("authorization") ?? "")?.[1];
  if (bearer) {
    return {
      upstream: await apiFetchWithAccessToken(path, bearer, init),
      setGuestToken: null,
    };
  }

  const guestHeader = incoming.get("x-guest-token")?.trim();
  if (guestHeader) {
    const requestHeaders = new Headers(init.headers);
    requestHeaders.set("x-guest-token", guestHeader);
    if (!requestHeaders.has("x-storefront")) {
      requestHeaders.set("x-storefront", await requestedStorefront(incoming.get("x-storefront")));
    }
    if (!requestHeaders.has("content-type") && init.body) {
      requestHeaders.set("content-type", "application/json");
    }
    return {
      upstream: await fetch(`${getApiBaseUrl()}${path}`, {
        ...init,
        headers: requestHeaders,
        cache: "no-store",
      }),
      setGuestToken: null,
    };
  }

  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  if (access) {
    return {
      upstream: await apiFetchWithAccessToken(path, access, init),
      setGuestToken: null,
    };
  }

  if (!(await guestOrdersEnabled())) {
    return { upstream: guestOrdersOff(), setGuestToken: null };
  }

  let guest = jar.get(GUEST_COOKIE)?.value;
  let setGuestToken: string | null = null;
  if (!guest) {
    if (!options.createGuest) {
      return {
        upstream: new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
        setGuestToken: null,
      };
    }
    guest = randomUUID();
    setGuestToken = guest;
  }

  const headers = new Headers(init.headers);
  headers.set("x-guest-token", guest);
  if (!headers.has("x-storefront")) {
    headers.set("x-storefront", await requestedStorefront());
  }
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }
  const upstream = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  return { upstream, setGuestToken };
}

export function jsonFromUpstream(
  upstream: Response,
  payload: unknown,
  setGuestToken: string | null,
) {
  const response = NextResponse.json(payload, { status: upstream.status });
  return withGuestCookie(response, setGuestToken, upstream.ok);
}

export function withGuestCookie(
  response: NextResponse,
  setGuestToken: string | null,
  ok: boolean,
) {
  if (setGuestToken && ok) {
    response.cookies.set(GUEST_COOKIE, setGuestToken, authCookieOptions(GUEST_MAX_AGE_SEC));
  }
  return response;
}

function guestOrdersOff() {
  return new Response(
    JSON.stringify({
      message: "Guest orders are turned off. Please sign in to place an order.",
    }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}
