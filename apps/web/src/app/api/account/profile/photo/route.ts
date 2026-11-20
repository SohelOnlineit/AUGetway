import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";

export async function POST(request: Request) {
  const jar = await cookies();
  const body = await request.text();
  const upstream = await apiFetchWithAccessToken(
    "/account/profile/photo",
    jar.get(ACCESS_COOKIE)?.value,
    { method: "POST", body },
  );
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
