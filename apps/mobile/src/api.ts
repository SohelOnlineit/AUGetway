import { brand, siteUrl } from "../brand";

export const apiBase = (process.env.EXPO_PUBLIC_API_URL || `${siteUrl}/api`).replace(/\/$/, "");

export function mediaUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) return `${siteUrl}${path}`;
  return `${siteUrl}/${path}`;
}

export function money(minor: number, currency = "BDT") {
  const amount = Math.round(minor / 100).toLocaleString("en-US");
  return currency === "BDT" ? `৳${amount}` : `${amount} ${currency}`;
}

export function plainText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function messageFrom(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && typeof message[0] === "string") return message[0];
  return fallback;
}

export async function api<T>(
  path: string,
  init: RequestInit & { token?: string | null; guest?: string | null } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("x-amarpin-client", "app");
  headers.set("x-storefront", brand.scheme === "uniqbd" ? "uniqbd" : "amarpin");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  else if (init.guest) headers.set("x-guest-token", init.guest);
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(messageFrom(body, "Request failed"), response.status);
  return body as T;
}

export function uuid() {
  const bytes = new Uint8Array(16);
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.getRandomValues) cryptoRef.getRandomValues(bytes);
  else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
