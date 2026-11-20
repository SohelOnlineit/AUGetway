import { cookies } from "next/headers";
import { ACCESS_COOKIE } from "./constants";
import { verifyAccessToken } from "./session";

export async function viewerIsAdministrator(): Promise<boolean> {
  try {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (!token) return false;
    const claims = await verifyAccessToken(token);
    return claims?.roles.includes("ADMINISTRATOR") === true;
  } catch {
    return false;
  }
}
