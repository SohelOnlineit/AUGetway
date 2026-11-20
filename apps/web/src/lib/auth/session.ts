import { hasStaffAccess, type RoleName } from "@amarpin/types";
import { jwtVerify } from "jose";
import { ACCESS_COOKIE } from "./constants";

export interface AccessClaims {
  sub: string;
  roles: RoleName[];
  typ: string;
}

function getAccessSecret() {
  const secret =
    process.env.AUTH_JWT_ACCESS_SECRET ?? process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("AUTH_JWT_ACCESS_SECRET (or JWT_ACCESS_SECRET) is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getAccessSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.typ !== "access" || typeof payload.sub !== "string") {
      return null;
    }
    const roles = Array.isArray(payload.roles)
      ? (payload.roles.filter((role): role is RoleName => typeof role === "string") as RoleName[])
      : [];
    return { sub: payload.sub, roles, typ: "access" };
  } catch {
    return null;
  }
}

export function readAccessCookie(
  cookieHeader: string | null,
): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(`${ACCESS_COOKIE}=`)) {
      return decodeURIComponent(part.slice(ACCESS_COOKIE.length + 1));
    }
  }
  return undefined;
}

export function canAccessStaff(roles: readonly string[]): boolean {
  return hasStaffAccess(roles);
}
