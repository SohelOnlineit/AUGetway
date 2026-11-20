import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";

export async function GET(request: Request) {
  const jar = await cookies();
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  const path = limit
    ? `/wallet/transactions?limit=${encodeURIComponent(limit)}`
    : "/wallet/transactions";
  const upstream = await apiFetchWithAccessToken(
    path,
    jar.get(ACCESS_COOKIE)?.value,
  );
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
