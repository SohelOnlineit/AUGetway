import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";

export async function GET() {
  const upstream = await fetch(`${getApiBaseUrl()}/storefront/live-chat`, { cache: "no-store" });
  const payload = await upstream.json().catch(() => ({ guestChat: false, guestPictures: false }));
  return NextResponse.json(payload, { status: upstream.status });
}
