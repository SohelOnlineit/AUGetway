import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const jar = await cookies();
  const upstream = await apiFetchWithAccessToken(
    `/account/notifications/${id}/read`,
    jar.get(ACCESS_COOKIE)?.value,
    { method: "PATCH" },
  );
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
