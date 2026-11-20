/**
 * Nest exposes routes under global prefix `api` (see apps/api main.ts).
 * Paths passed to fetch are like `/admin/...`, `/auth/login` — so the base URL
 * must end with `/api`. Many .env examples use `http://localhost:4000` without
 * `/api`, which would call `/admin/...` on the server and return 404 ("Cannot GET").
 */
export function getApiBaseUrl(): string {
  const raw =
    process.env.INTERNAL_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://127.0.0.1:4000/api";
  const noTrail = raw.replace(/\/+$/, "");
  if (noTrail.endsWith("/api")) {
    return noTrail;
  }
  return `${noTrail}/api`;
}
