"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    read();
    window.addEventListener("uniqpay-theme", read);
    return () => window.removeEventListener("uniqpay-theme", read);
  }, []);

  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.dataset.theme = next;
    root.style.colorScheme = next;
    try {
      localStorage.setItem("uniqpay_theme", next === "dark" ? "DARK" : "LIGHT");
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new Event("uniqpay-theme"));
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10L5.6 18.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M20 14.5A7.5 7.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
