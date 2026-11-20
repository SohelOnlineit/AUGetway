import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { requestedStorefront } from "@/lib/storefront.server";

export async function POST(request: Request) {
  const body = await request.text();
  const upstream = await fetch(`${getApiBaseUrl()}/content/contact`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-storefront": await requestedStorefront(request.headers.get("x-storefront")),
    },
    body,
  });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
