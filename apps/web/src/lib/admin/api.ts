import type { Permission } from "@amarpin/types";

export async function adminFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const response = await fetch(`/api/admin${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(", ")
      : payload.message || `Request failed (${response.status})`;
    return { ok: false, status: response.status, message };
  }
  return { ok: true, data: payload as T };
}

export function can(permissions: Permission[] | undefined, needed: Permission) {
  return Boolean(permissions?.includes(needed));
}

export function formatMinor(minor: number, currency = "BDT") {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}
