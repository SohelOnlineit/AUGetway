import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth/constants";
import { verifyAccessToken } from "@/lib/auth/session";

/** Returns the httpOnly access cookie for Socket.IO handshake auth. */
export async function GET() {
  const jar = await cookies();
  const accessToken = jar.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const claims = await verifyAccessToken(accessToken);
  if (!claims) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    accessToken,
    expiresHintSec: SESSION_MAX_AGE_SEC,
  });
}
