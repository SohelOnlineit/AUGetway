import { NextResponse } from "next/server";
import { isThemePreference, THEME_COOKIE } from "./theme";

export function attachThemeCookie(response: NextResponse, theme: unknown) {
  if (!isThemePreference(theme)) return response;
  response.cookies.set(THEME_COOKIE, theme, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
