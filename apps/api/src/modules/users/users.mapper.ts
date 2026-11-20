import type { PublicUser, RoleName } from "@amarpin/types";
import type { Role, User } from "../../generated/prisma/client";

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    phone: user.phone,
    roles: user.roles as RoleName[],
    status: user.status,
    emailVerified: user.emailVerified,
    theme: user.theme,
  };
}

export function asRoleName(role: Role): RoleName {
  return role as RoleName;
}
