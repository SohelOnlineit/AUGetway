import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";

/** Web readiness probe — checks Next process + upstream API live endpoint. */
export async function GET() {
  const checkedAt = new Date().toISOString();
  let api: { status: string; error?: string } = { status: "unknown" };
  try {
    const response = await fetch(`${getApiBaseUrl()}/health/live`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    api = {
      status: response.ok ? "ok" : "down",
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    api = {
      status: "down",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const ok = api.status === "ok";
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      service: "AuGetway-web",
      checkedAt,
      dependencies: { api },
    },
    { status: ok ? 200 : 503 },
  );
}
