import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { ACCESS_COOKIE } from "@/lib/auth/constants";

export async function GET() {
  const jar = await cookies();
  const accessToken = jar.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const upstream = await fetch(`${getApiBaseUrl()}/admin/me`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
