import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { ACCESS_COOKIE, REFRESH_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth/constants";
import { authCookieOptions } from "@/lib/auth/cookie-options";
import { attachThemeCookie } from "@/lib/theme/theme-cookie";

function safeNext(target: string, fallback: string): string {
  const trimmed = target.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\") &&
    !trimmed.includes("\n") &&
    !trimmed.includes("\r")
  ) {
    return trimmed;
  }
  return fallback;
}

function errorText(payload: Record<string, unknown>): string {
  const message = payload.message;
  const text = Array.isArray(message) ? String(message[0] ?? "") : typeof message === "string" ? message : "";
  const trimmed = text.trim();
  return (trimmed || "Sign in failed").slice(0, 180);
}

function redirectTo(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { location: path },
  });
}

function destinationFor(roles: string[], nextPath: string): string {
  const staff = roles.some((role) => role === "ADMINISTRATOR" || role === "EDITOR");
  const fallback = staff ? "/admin" : "/dashboard";
  let destination = safeNext(nextPath, fallback);
  if (destination.startsWith("/admin") && !staff) destination = "/dashboard";
  return destination;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const formPost =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  let email = "";
  let password = "";
  let nextPath = "";
  if (formPost) {
    const form = await request.formData();
    email = String(form.get("email") ?? "");
    password = String(form.get("password") ?? "");
    nextPath = String(form.get("next") ?? "");
  } else {
    const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
    if (!body) {
      return NextResponse.json({ message: "Sign in failed" }, { status: 400 });
    }
    email = body.email ?? "";
    password = body.password ?? "";
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers["user-agent"] = userAgent;

  const upstream = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password }),
  });

  const payload = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

  if (!upstream.ok) {
    if (formPost) {
      const back = new URLSearchParams();
      back.set("error", errorText(payload));
      const next = nextPath.trim() ? safeNext(nextPath, "") : "";
      if (next) back.set("next", next);
      return redirectTo(`/login?${back.toString()}`);
    }
    return NextResponse.json(payload, { status: upstream.status });
  }

  const tokens = payload.tokens as
    | {
        accessToken: string;
        refreshToken: string;
        accessTokenExpiresIn: number;
      }
    | undefined;
  const user =
    payload.user && typeof payload.user === "object"
      ? (payload.user as { roles?: string[]; theme?: unknown })
      : undefined;

  if (formPost) {
    const response = attachThemeCookie(
      redirectTo(destinationFor(user?.roles ?? [], nextPath)),
      user?.theme,
    );
    if (tokens) {
      response.cookies.set(ACCESS_COOKIE, tokens.accessToken, authCookieOptions(tokens.accessTokenExpiresIn));
      response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, authCookieOptions(SESSION_MAX_AGE_SEC));
    }
    return response;
  }

  const nativeApp = request.headers.get("x-amarpin-client") === "app";
  const response = attachThemeCookie(
    NextResponse.json(nativeApp && tokens ? { user: payload.user, tokens } : { user: payload.user }),
    user?.theme,
  );
  if (tokens) {
    response.cookies.set(ACCESS_COOKIE, tokens.accessToken, authCookieOptions(tokens.accessTokenExpiresIn));
    response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, authCookieOptions(SESSION_MAX_AGE_SEC));
  }
  return response;
}
