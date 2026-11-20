import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  if (!/^[a-f0-9]{32}\.(jpg|jpeg|png|webp)$/i.test(filename)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  const upstream = await fetch(`${getApiBaseUrl()}/content/media/${filename}`);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ message: "Not found" }, { status: upstream.status || 404 });
  }
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/octet-stream",
      "cache-control": upstream.headers.get("cache-control") || "public, max-age=86400",
    },
  });
}
