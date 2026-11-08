export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4100/api";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  if (typeof window !== "undefined") {
    const token = sessionStorage.getItem("uniqpay_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API}${path}`, { ...init, headers, cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(data.message) ? data.message.join(", ") : data.message;
    throw new Error(message || "Request failed");
  }
  return data as T;
}
