"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme: "auto";
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * The Cloudflare check. It shows nothing while the check is off.
 * Pass `siteKey` to show the widget for a key that is not live yet (the admin test).
 * A token works once, so raise `resetKey` after every submit to get a fresh one.
 */
export function TurnstileField({
  resetKey = 0,
  siteKey: forcedKey,
  onToken,
  onRequired,
}: {
  resetKey?: number;
  siteKey?: string;
  onToken: (token: string) => void;
  onRequired?: (required: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const onRequiredRef = useRef(onRequired);
  const [fetchedKey, setFetchedKey] = useState("");
  onTokenRef.current = onToken;
  onRequiredRef.current = onRequired;
  const siteKey = forcedKey ?? fetchedKey;

  useEffect(() => {
    if (forcedKey !== undefined) {
      onRequiredRef.current?.(Boolean(forcedKey));
      return;
    }
    let cancelled = false;
    api<{ siteKey?: string }>("/security/turnstile")
      .then((payload) => {
        if (cancelled) return;
        const key = payload.siteKey?.trim() || "";
        setFetchedKey(key);
        onRequiredRef.current?.(Boolean(key));
      })
      .catch(() => {
        // If the key cannot be read, the form stays open. The server still decides.
        if (!cancelled) onRequiredRef.current?.(false);
      });
    return () => {
      cancelled = true;
    };
  }, [forcedKey]);

  useEffect(() => {
    const element = host.current;
    if (!siteKey || !element) return;
    let widgetId = "";
    let cancelled = false;
    onTokenRef.current("");
    void loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile || !host.current) return;
        widgetId = window.turnstile.render(host.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
        });
      })
      .catch(() => onTokenRef.current(""));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [resetKey, siteKey]);

  if (!siteKey) return null;
  return <div className="ts-widget" ref={host} />;
}
