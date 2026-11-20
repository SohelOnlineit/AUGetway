/** Shared domain constants for web + API. */

import type { ThemePreference } from "./account";

export const DEFAULT_CURRENCY = "BDT" as const;

export const APP_NAME = "AuGetway" as const;

export type HealthStatus = "ok" | "degraded" | "down";

export const ROLES = [
  "CUSTOMER",
  "VIP",
  "RESELLER",
  "AFFILIATE",
  "SUPPLIER",
  "EDITOR",
  "ADMINISTRATOR",
] as const;

export type RoleName = (typeof ROLES)[number];

export const STAFF_ROLES: readonly RoleName[] = [
  "EDITOR",
  "ADMINISTRATOR",
] as const;

export const PERMISSIONS = [
  "admin:access",
  "admin:users:read",
  "admin:users:write",
  "admin:catalog:read",
  "admin:catalog:write",
  "admin:inventory:read",
  "admin:inventory:write",
  "admin:orders:read",
  "admin:orders:write",
  "admin:customers:read",
  "admin:wallet:adjust",
  "admin:payments:read",
  "admin:refunds:read",
  "admin:refunds:write",
  "admin:support:read",
  "admin:support:write",
  "admin:chat:access",
  "admin:seo:read",
  "admin:seo:write",
  "admin:content:read",
  "admin:content:write",
  "admin:contact:read",
  "admin:contact:write",
  "admin:product-requests:read",
  "admin:product-requests:write",
  "admin:coupons:read",
  "admin:coupons:write",
  "admin:points:read",
  "admin:points:write",
  "admin:reviews:read",
  "admin:reviews:write",
  "admin:analytics:read",
  "admin:audit:read",
  "account:access",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Static role → permission matrix (API enforces; UI is advisory). */
export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  CUSTOMER: ["account:access"],
  VIP: ["account:access"],
  RESELLER: ["account:access"],
  AFFILIATE: ["account:access"],
  SUPPLIER: ["account:access"],
  EDITOR: [
    "account:access",
    "admin:access",
    "admin:catalog:read",
    "admin:catalog:write",
    "admin:inventory:read",
    "admin:inventory:write",
    "admin:orders:read",
    "admin:customers:read",
    "admin:users:read",
    "admin:payments:read",
    "admin:refunds:read",
    "admin:support:read",
    "admin:chat:access",
    "admin:seo:read",
    "admin:seo:write",
    "admin:content:read",
    "admin:content:write",
    "admin:contact:read",
    "admin:contact:write",
    "admin:product-requests:read",
    "admin:coupons:read",
    "admin:reviews:read",
    "admin:reviews:write",
    "admin:analytics:read",
    "admin:audit:read",
  ],
  ADMINISTRATOR: [
    "account:access",
    "admin:access",
    "admin:users:read",
    "admin:users:write",
    "admin:catalog:read",
    "admin:catalog:write",
    "admin:inventory:read",
    "admin:inventory:write",
    "admin:orders:read",
    "admin:orders:write",
    "admin:customers:read",
    "admin:wallet:adjust",
    "admin:payments:read",
    "admin:refunds:read",
    "admin:refunds:write",
    "admin:support:read",
    "admin:support:write",
    "admin:chat:access",
    "admin:seo:read",
    "admin:seo:write",
    "admin:content:read",
    "admin:content:write",
    "admin:contact:read",
    "admin:contact:write",
    "admin:product-requests:read",
    "admin:product-requests:write",
    "admin:coupons:read",
    "admin:coupons:write",
    "admin:points:read",
    "admin:points:write",
    "admin:reviews:read",
    "admin:reviews:write",
    "admin:analytics:read",
    "admin:audit:read",
  ],
};

export function permissionsForRoles(roles: readonly RoleName[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    const list = ROLE_PERMISSIONS[role];
    if (!list) continue;
    for (const permission of list) set.add(permission);
  }
  return [...set];
}

export function hasPermission(
  roles: readonly RoleName[],
  permission: Permission,
): boolean {
  return permissionsForRoles(roles).includes(permission);
}

export function isStaffRole(role: string): role is RoleName {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function hasStaffAccess(roles: readonly string[]): boolean {
  return roles.some((role) => isStaffRole(role));
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  phone?: string | null;
  roles: RoleName[];
  status: string;
  emailVerified: boolean;
  theme: ThemePreference;
}

export * from "./catalog";
export * from "./commerce";
export * from "./account";
export * from "./admin";
export * from "./refunds";
export * from "./support";
export * from "./content";
export * from "./promotions";
export * from "./origin";
