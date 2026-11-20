export type RolePermissionKey =
  | "admin_panel_access"
  | "dashboard_analytics"
  | "view_products"
  | "create_edit_products"
  | "delete_deactivate_products"
  | "submit_product_drafts"
  | "gift_card_inventory"
  | "view_blog_overview"
  | "view_blog_posts"
  | "create_edit_blog_posts"
  | "publish_blog_posts"
  | "delete_blog_posts"
  | "manage_blog_categories"
  | "view_all_orders"
  | "update_order_status"
  | "approve_mfs_payments"
  | "manage_coupon_codes"
  | "manage_points"
  | "view_customers"
  | "edit_customers_wallet"
  | "auto_delivery"
  | "manage_security_settings"
  | "manage_roles_permissions"
  | "view_audit_logs"
  | "place_guest_orders"
  | "live_chat_picture_upload"
  | "live_chat_without_login"
  | "manage_appearance_theme"
  | "manage_email_settings"
  | "manage_general_settings";

export type RoleId =
  | "shop_manager"
  | "guest"
  | "customer"
  | "vip"
  | "reseller"
  | "affiliate"
  | "supplier"
  | "subscriber"
  | "contributor"
  | "author"
  | "blogger"
  | "editor"
  | "administrator";

export type PermissionGroup = {
  key: string;
  label: string;
  hint: string;
  permissions: Array<{ key: RolePermissionKey; label: string }>;
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "admin_panel",
    label: "Admin panel",
    hint: "Toggle access for this role",
    permissions: [
      { key: "admin_panel_access", label: "Admin panel access" },
      { key: "dashboard_analytics", label: "Dashboard & analytics" },
    ],
  },
  {
    key: "catalog",
    label: "Catalog",
    hint: "Toggle access for this role",
    permissions: [
      { key: "view_products", label: "View products" },
      { key: "create_edit_products", label: "Create & edit products" },
      { key: "delete_deactivate_products", label: "Delete / deactivate products" },
      { key: "submit_product_drafts", label: "Submit product drafts" },
      { key: "gift_card_inventory", label: "Gift card inventory" },
    ],
  },
  {
    key: "blog",
    label: "Blog",
    hint: "Toggle access for this role",
    permissions: [
      { key: "view_blog_overview", label: "Blog overview" },
      { key: "view_blog_posts", label: "View blog posts" },
      { key: "create_edit_blog_posts", label: "Create & edit blog posts" },
      { key: "publish_blog_posts", label: "Publish & approve blog posts" },
      { key: "delete_blog_posts", label: "Delete blog posts" },
      { key: "manage_blog_categories", label: "Manage blog categories" },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    hint: "Coupon codes and points stay off until you turn them on",
    permissions: [
      { key: "view_all_orders", label: "View all orders" },
      { key: "update_order_status", label: "Update order status" },
      { key: "approve_mfs_payments", label: "Approve MFS payments" },
      { key: "manage_coupon_codes", label: "Coupon codes" },
      { key: "manage_points", label: "Points system" },
    ],
  },
  {
    key: "customers",
    label: "Customers",
    hint: "Auto Delivery sends the gift card as soon as that role pays",
    permissions: [
      { key: "view_customers", label: "View customers" },
      { key: "edit_customers_wallet", label: "Edit customers & wallet" },
      { key: "auto_delivery", label: "Auto Delivery" },
    ],
  },
  {
    key: "security",
    label: "Security",
    hint: "Toggle access for this role",
    permissions: [
      { key: "manage_security_settings", label: "Security settings" },
      { key: "manage_roles_permissions", label: "Roles & permissions" },
      { key: "view_audit_logs", label: "View audit logs" },
    ],
  },
  {
    key: "checkout",
    label: "Checkout",
    hint: "Only the Guest role controls ordering without an account",
    permissions: [{ key: "place_guest_orders", label: "Allow guest orders" }],
  },
  {
    key: "live_chat",
    label: "Live chat",
    hint: "Picture uploads, and guest chat without an account",
    permissions: [
      { key: "live_chat_picture_upload", label: "Allow picture uploads" },
      { key: "live_chat_without_login", label: "Allow live chat without login" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    hint: "Appearance, email, and site settings",
    permissions: [
      { key: "manage_appearance_theme", label: "Appearance & theme" },
      { key: "manage_email_settings", label: "Email settings" },
      { key: "manage_general_settings", label: "General site settings" },
    ],
  },
];

const ALL_KEYS = PERMISSION_GROUPS.flatMap((group) => group.permissions.map((item) => item.key));

function matrix(enabled: RolePermissionKey[]): Record<RolePermissionKey, boolean> {
  const on = new Set(enabled);
  return Object.fromEntries(ALL_KEYS.map((key) => [key, on.has(key)])) as Record<RolePermissionKey, boolean>;
}

function everyKey(): Record<RolePermissionKey, boolean> {
  return matrix(ALL_KEYS);
}

export type RoleProfile = {
  id: RoleId;
  label: string;
  description: string;
  locked: boolean;
  summary: string[];
  permissions: Record<RolePermissionKey, boolean>;
};

export const ROLE_PROFILES: RoleProfile[] = [
  {
    id: "shop_manager",
    label: "Shop manager",
    description: "Full shop operations without site-wide settings.",
    locked: false,
    summary: [
      "Access admin panel, dashboard, and analytics.",
      "Manage products, orders, and gift card stock.",
      "View and edit customer accounts and wallet balance.",
      "Cannot change appearance, theme, or email settings.",
    ],
    permissions: matrix([
      "admin_panel_access",
      "dashboard_analytics",
      "view_products",
      "create_edit_products",
      "delete_deactivate_products",
      "gift_card_inventory",
      "view_all_orders",
      "update_order_status",
      "view_customers",
      "edit_customers_wallet",
      "view_blog_posts",
      "live_chat_picture_upload",
    ]),
  },
  {
    id: "guest",
    label: "Guest",
    description: "Visitors who have not registered. Turn guest orders off to require sign-in before checkout.",
    locked: false,
    summary: [
      "Allow guest orders lets visitors check out without an account.",
      "Turn that permission off and save to require sign-in.",
      "Live chat without login is under Live chat on this profile.",
      "No admin panel access.",
    ],
    permissions: matrix([
      "place_guest_orders",
      "live_chat_without_login",
      "live_chat_picture_upload",
    ]),
  },
  {
    id: "customer",
    label: "Customer",
    description: "Storefront buyer with no admin access.",
    locked: false,
    summary: [
      "Browse and purchase on the storefront.",
      "Manage own orders, wallet, and profile.",
      "No access to the admin panel.",
    ],
    permissions: matrix(["live_chat_picture_upload"]),
  },
  {
    id: "vip",
    label: "VIP",
    description: "Premium customer with priority support and exclusive benefits.",
    locked: false,
    summary: [
      "All standard storefront account features.",
      "VIP status for priority orders and support.",
      "Manual delivery stays off; auto delivery is on by default.",
      "No access to the admin panel.",
    ],
    permissions: matrix(["auto_delivery", "live_chat_picture_upload"]),
  },
  {
    id: "reseller",
    label: "Reseller",
    description: "Bulk buyer with programmatic API access and reseller pricing.",
    locked: false,
    summary: [
      "Reseller dashboard and API on the storefront.",
      "Wallet-funded bulk orders at reseller rates.",
      "No admin panel access by default.",
    ],
    permissions: matrix(["live_chat_picture_upload"]),
  },
  {
    id: "affiliate",
    label: "Affiliate",
    description: "Referral partner earning commission on referred sales.",
    locked: false,
    summary: [
      "Affiliate dashboard, referral links, and payouts.",
      "Commission tracking on qualifying orders.",
      "No admin panel access by default.",
    ],
    permissions: matrix(["live_chat_picture_upload"]),
  },
  {
    id: "supplier",
    label: "Supplier",
    description: "External fulfillment partner for digital goods delivery.",
    locked: false,
    summary: [
      "Linked to supplier integrations for order fulfillment.",
      "Storefront access only by default.",
      "Grant admin permissions here if staff oversight is needed.",
    ],
    permissions: matrix([]),
  },
  {
    id: "subscriber",
    label: "Subscriber",
    description: "Registered user with newsletter and account access.",
    locked: false,
    summary: ["Storefront account and order history.", "No admin panel access."],
    permissions: matrix(["live_chat_picture_upload"]),
  },
  {
    id: "contributor",
    label: "Contributor",
    description: "Can submit product drafts for review.",
    locked: false,
    summary: [
      "Submit product drafts for approval.",
      "Create blog drafts for review.",
      "No admin panel or site-wide settings access.",
    ],
    permissions: matrix(["submit_product_drafts", "view_blog_posts", "create_edit_blog_posts"]),
  },
  {
    id: "author",
    label: "Author",
    description: "Create and publish own product listings.",
    locked: false,
    summary: [
      "Create and edit own products.",
      "Submit drafts and manage own catalog items.",
      "Create and edit blog posts (no delete).",
    ],
    permissions: matrix([
      "admin_panel_access",
      "view_products",
      "create_edit_products",
      "submit_product_drafts",
      "view_blog_posts",
      "create_edit_blog_posts",
    ]),
  },
  {
    id: "blogger",
    label: "Blogger",
    description: "Dedicated blog writer — submit posts for admin review.",
    locked: false,
    summary: [
      "Write blog posts from the customer dashboard.",
      "View and create blog posts (approval required).",
      "No admin panel or site-wide settings access.",
    ],
    permissions: matrix(["view_blog_posts", "create_edit_blog_posts"]),
  },
  {
    id: "editor",
    label: "Editor",
    description: "Manage catalog and moderate content.",
    locked: false,
    summary: [
      "Full catalog management.",
      "View orders and customer data.",
      "Blog overview, posts, and categories.",
      "No security or site-wide settings.",
    ],
    permissions: matrix([
      "admin_panel_access",
      "dashboard_analytics",
      "view_products",
      "create_edit_products",
      "delete_deactivate_products",
      "gift_card_inventory",
      "view_all_orders",
      "view_customers",
      "view_blog_overview",
      "view_blog_posts",
      "create_edit_blog_posts",
      "publish_blog_posts",
      "delete_blog_posts",
      "manage_blog_categories",
      "live_chat_picture_upload",
    ]),
  },
  {
    id: "administrator",
    label: "Administrator",
    description: "Full access to all admin features.",
    locked: true,
    summary: [
      "Unrestricted access to every admin area.",
      "Manage roles, security, and site settings.",
      "Coupon codes and the points system are on. Other roles stay off until you turn them on.",
    ],
    permissions: everyKey(),
  },
];

export function groupsForRole(roleId: RoleId): PermissionGroup[] {
  return PERMISSION_GROUPS.filter((group) => roleId === "guest" || group.key !== "checkout").map((group) => {
    if (group.key === "sales") {
      return {
        ...group,
        hint:
          roleId === "administrator"
            ? "Coupon codes and points are on for Administrator"
            : "Coupon codes and points stay off until you turn them on",
      };
    }
    if (group.key !== "live_chat" || roleId === "guest") return group;
    return {
      ...group,
      hint: "Picture uploads in live chat for this role",
      permissions: group.permissions.filter((item) => item.key === "live_chat_picture_upload"),
    };
  });
}

export function countEnabled(permissions: Record<RolePermissionKey, boolean>) {
  return Object.values(permissions).filter(Boolean).length;
}

export const ROLE_STORAGE_KEY = "uq_role_profiles";
