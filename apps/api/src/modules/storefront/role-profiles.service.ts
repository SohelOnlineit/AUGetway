import { BadRequestException, Injectable } from "@nestjs/common";
import type { Permission } from "@amarpin/types";
import { PrismaService } from "../../prisma/prisma.service";

const SETTINGS_KEY = "roles.permissions";

const ROLE_IDS = [
  "shop_manager",
  "guest",
  "customer",
  "vip",
  "reseller",
  "affiliate",
  "supplier",
  "subscriber",
  "contributor",
  "author",
  "blogger",
  "editor",
  "administrator",
] as const;

const PERMISSION_KEYS = [
  "admin_panel_access",
  "dashboard_analytics",
  "view_products",
  "create_edit_products",
  "delete_deactivate_products",
  "submit_product_drafts",
  "gift_card_inventory",
  "view_blog_overview",
  "view_blog_posts",
  "create_edit_blog_posts",
  "publish_blog_posts",
  "delete_blog_posts",
  "manage_blog_categories",
  "view_all_orders",
  "update_order_status",
  "approve_mfs_payments",
  "manage_coupon_codes",
  "manage_points",
  "view_customers",
  "edit_customers_wallet",
  "auto_delivery",
  "manage_security_settings",
  "manage_roles_permissions",
  "view_audit_logs",
  "place_guest_orders",
  "live_chat_picture_upload",
  "live_chat_without_login",
  "manage_appearance_theme",
  "manage_email_settings",
  "manage_general_settings",
] as const;

const PICTURE_UPLOAD_DEFAULT = new Set([
  "shop_manager",
  "guest",
  "customer",
  "vip",
  "reseller",
  "affiliate",
  "subscriber",
  "editor",
  "administrator",
]);

export type RoleOverrideStore = Partial<
  Record<(typeof ROLE_IDS)[number], Partial<Record<(typeof PERMISSION_KEYS)[number], boolean>>>
>;

@Injectable()
export class RoleProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverrides(): Promise<RoleOverrideStore> {
    return this.read();
  }

  async saveOverrides(body: unknown): Promise<RoleOverrideStore> {
    const overrides = sanitizeBody(body);
    const value = JSON.stringify(overrides);
    await this.prisma.systemMeta.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value },
      update: { value },
    });
    return overrides;
  }

  /** Guest checkout stays on until an admin saves the Guest role with this permission off. */
  async guestOrdersEnabled(): Promise<boolean> {
    return this.enabled("guest", "place_guest_orders", true);
  }

  /** Guest profile controls chat for visitors who are not signed in. */
  async guestLiveChatEnabled(): Promise<boolean> {
    return this.enabled("guest", "live_chat_without_login", true);
  }

  /**
   * Picture uploads follow the role saved on Roles & permissions.
   * Guests use the Guest profile. Administrator stays allowed.
   */
  /**
   * Gift cards deliver themselves after payment only when the buyer's role
   * has Auto Delivery. Guests follow the Guest profile. Administrator always has it.
   */
  async autoDeliveryEnabled(roles: readonly string[], isGuest: boolean): Promise<boolean> {
    if (isGuest) return this.enabled("guest", "auto_delivery", false);
    const ids = roles.map((role) => role.toLowerCase());
    if (ids.includes("administrator")) return true;
    if (ids.length === 0) return false;
    const checks = await Promise.all(
      ids.map((id) => {
        if (!isRoleId(id)) return Promise.resolve(false);
        return this.enabled(id, "auto_delivery", id === "vip");
      }),
    );
    return checks.some(Boolean);
  }

  /**
   * Coupon codes are on for Administrator and off for every other role
   * until that role's toggle is saved on.
   */
  async couponCodesEnabled(roles: readonly string[]): Promise<boolean> {
    const ids = roles.map((role) => role.toLowerCase()).filter(isRoleId);
    if (ids.length === 0) return false;
    const checks = await Promise.all(
      ids.map((id) => this.enabled(id, "manage_coupon_codes", id === "administrator")),
    );
    return checks.some(Boolean);
  }

  async applyCouponAccess(roles: readonly string[], permissions: readonly Permission[]): Promise<Permission[]> {
    if (await this.couponCodesEnabled(roles)) return [...permissions];
    return permissions.filter((permission) => permission !== "admin:coupons:read" && permission !== "admin:coupons:write");
  }

  /**
   * Points are on for Administrator and off for every other role
   * until that role's toggle is saved on.
   */
  async pointsEnabled(roles: readonly string[]): Promise<boolean> {
    const ids = roles.map((role) => role.toLowerCase()).filter(isRoleId);
    if (ids.length === 0) return false;
    const checks = await Promise.all(
      ids.map((id) => this.enabled(id, "manage_points", id === "administrator")),
    );
    return checks.some(Boolean);
  }

  async applyPointsAccess(roles: readonly string[], permissions: readonly Permission[]): Promise<Permission[]> {
    if (await this.pointsEnabled(roles)) return [...permissions];
    return permissions.filter((permission) => permission !== "admin:points:read" && permission !== "admin:points:write");
  }

  async chatPicturesEnabled(roles: readonly string[], isGuest: boolean): Promise<boolean> {
    if (isGuest) return this.enabled("guest", "live_chat_picture_upload", true);
    const ids = roles.map((role) => role.toLowerCase());
    if (ids.includes("administrator")) return true;
    if (ids.length === 0) return false;
    const checks = await Promise.all(
      ids.map((id) => this.enabled(id as (typeof ROLE_IDS)[number], "live_chat_picture_upload", PICTURE_UPLOAD_DEFAULT.has(id))),
    );
    return checks.some(Boolean);
  }

  private async enabled(
    roleId: (typeof ROLE_IDS)[number],
    key: (typeof PERMISSION_KEYS)[number],
    fallback: boolean,
  ): Promise<boolean> {
    const stored = await this.read();
    const value = stored[roleId]?.[key];
    return typeof value === "boolean" ? value : fallback;
  }

  private async read(): Promise<RoleOverrideStore> {
    const row = await this.prisma.systemMeta.findUnique({ where: { key: SETTINGS_KEY } });
    if (!row?.value) return {};
    try {
      return sanitizeOverrides(JSON.parse(row.value));
    } catch {
      return {};
    }
  }
}

function isRoleId(value: string): value is (typeof ROLE_IDS)[number] {
  return (ROLE_IDS as readonly string[]).includes(value);
}

function sanitizeBody(body: unknown): RoleOverrideStore {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Invalid role profiles");
  }
  const raw = (body as { overrides?: unknown }).overrides;
  if (raw === undefined) return {};
  return sanitizeOverrides(raw);
}

function sanitizeOverrides(raw: unknown): RoleOverrideStore {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const roles = new Set<string>(ROLE_IDS);
  const permissions = new Set<string>(PERMISSION_KEYS);
  const next: RoleOverrideStore = {};
  for (const [roleId, matrix] of Object.entries(raw)) {
    if (!roles.has(roleId) || !matrix || typeof matrix !== "object" || Array.isArray(matrix)) continue;
    const clean: Partial<Record<(typeof PERMISSION_KEYS)[number], boolean>> = {};
    for (const [key, value] of Object.entries(matrix)) {
      if (!permissions.has(key) || typeof value !== "boolean") continue;
      clean[key as (typeof PERMISSION_KEYS)[number]] = value;
    }
    next[roleId as (typeof ROLE_IDS)[number]] = clean;
  }
  return next;
}
