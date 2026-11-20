"use client";

import { useEffect } from "react";
import { applyTheme, isThemePreference, readThemePreference } from "@/lib/theme/theme";

/** Keeps System mode in step with the OS, and a signed-in profile theme with this browser. */
export function ThemeSync({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onScheme() {
      if (readThemePreference() === "SYSTEM") applyTheme("SYSTEM");
    }
    media.addEventListener("change", onScheme);

    if (!signedIn) {
      return () => media.removeEventListener("change", onScheme);
    }

    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/account/profile");
      if (!response.ok || cancelled) return;
      const profile = (await response.json()) as { theme?: unknown };
      if (!isThemePreference(profile.theme) || cancelled) return;
      if (profile.theme !== readThemePreference()) applyTheme(profile.theme);
    })();

    return () => {
      cancelled = true;
      media.removeEventListener("change", onScheme);
    };
  }, [signedIn]);

  return null;
}
