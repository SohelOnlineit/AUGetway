import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  const jar = await cookies();
  const upstream = await apiFetchWithAccessToken(
    `/account/wishlist/${itemId}`,
    jar.get(ACCESS_COOKIE)?.value,
    { method: "DELETE" },
  );
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
