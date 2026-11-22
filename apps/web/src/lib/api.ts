import { clearToken, readToken } from "@/lib/token";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4100/api";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = readToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API}${path}`, { ...init, headers, cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  if (!response.ok) {
    // A desk sign-in lasts 7 days. When the server no longer accepts the saved token, drop it and go to the sign-in page
    // instead of leaving every screen showing "Sign in required".
    if (response.status === 401 && token && typeof window !== "undefined" && !path.startsWith("/auth/login")) {
      clearToken();
      if (!window.location.pathname.startsWith("/au")) window.location.assign("/au");
    }
    const message = Array.isArray(data.message) ? data.message.join(", ") : data.message;
    throw new Error(message || "Request failed");
  }
  return data as T;
}
