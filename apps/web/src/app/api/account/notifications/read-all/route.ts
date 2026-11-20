import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";

export async function POST() {
  const jar = await cookies();
  const upstream = await apiFetchWithAccessToken(
    "/account/notifications/read-all",
    jar.get(ACCESS_COOKIE)?.value,
    { method: "POST" },
  );
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
