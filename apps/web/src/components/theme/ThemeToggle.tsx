"use client";

import { useState, useSyncExternalStore } from "react";
import type { ThemePreference } from "@amarpin/types";
import { applyTheme, readThemePreference } from "@/lib/theme/theme";

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "LIGHT", label: "Light" },
  { value: "DARK", label: "Dark" },
  { value: "SYSTEM", label: "System" },
];

function subscribe(onStoreChange: () => void) {
  window.addEventListener("uq-theme-change", onStoreChange);
  return () => window.removeEventListener("uq-theme-change", onStoreChange);
}

export function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribe,
    readThemePreference,
    () => null,
  );
  const [pending, setPending] = useState(false);

  async function choose(next: ThemePreference) {
    applyTheme(next);
    setPending(true);
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => null);
    setPending(false);
    if (response && response.ok) return;
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={preference === option.value}
          aria-label={`${option.label} theme`}
          disabled={pending}
          onClick={() => void choose(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
