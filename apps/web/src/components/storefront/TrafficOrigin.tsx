"use client";

import { useEffect } from "react";
import { normalizeOriginSource } from "@amarpin/types";

const STORAGE_KEY = "AuGetway-origin";

export function rememberTrafficOrigin() {
  const params = new URLSearchParams(window.location.search);
  const fromLink = params.get("utm_source");
  const fromSite = referrerSource(document.referrer, window.location.hostname);
  const incoming = fromLink ? normalizeOriginSource(fromLink) : fromSite;
  if (incoming !== "Direct") localStorage.setItem(STORAGE_KEY, incoming);
}

export function readTrafficOrigin() {
  rememberTrafficOrigin();
  return normalizeOriginSource(localStorage.getItem(STORAGE_KEY));
}

function referrerSource(referrer: string, ownHost: string) {
  if (!referrer) return "Direct";
  try {
    const url = new URL(referrer);
    if (url.hostname === ownHost || url.hostname.endsWith(`.${ownHost}`)) return "Direct";
    return normalizeOriginSource(url.hostname);
  } catch {
    return "Direct";
  }
}

export function TrafficOrigin() {
  useEffect(() => {
    rememberTrafficOrigin();
  }, []);
  return null;
}
