import type { OrderStatusPublic, PublicOrderSummary } from "./commerce";

export const THEME_PREFERENCES = ["SYSTEM", "LIGHT", "DARK"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export interface PublicProfile {
  id: string;
  email: string;
  displayName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  roles: string[];
  status: string;
  emailVerified: boolean;
  theme: ThemePreference;
  createdAt: string;
}

export interface PublicNotificationPreference {
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

export interface PublicNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  deliveries: Array<{
    channel: "IN_APP" | "EMAIL" | "PUSH";
    status: "PENDING" | "SKIPPED_NO_PROVIDER" | "FAILED" | "ACCEPTED";
    provider: string | null;
    failureReason: string | null;
    attemptedAt: string | null;
  }>;
}

export interface PublicWishlistItem {
  id: string;
  productId: string;
  title: string;
  slug: string;
  priceMinor: number;
  currency: string;
  primaryImageUrl: string | null;
  available: boolean;
  createdAt: string;
}

export type WalletTransactionTypePublic = "CREDIT" | "DEBIT";
export type WalletTransactionStatusPublic = "POSTED";

export interface PublicWallet {
  id: string;
  currency: string;
  balanceMinor: number;
  updatedAt: string;
}

export interface PublicWalletTransaction {
  id: string;
  type: WalletTransactionTypePublic;
  amountMinor: number;
  balanceAfterMinor: number;
  currency: string;
  status: WalletTransactionStatusPublic;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
}

export interface AccountOrderStatusSummary {
  status: OrderStatusPublic;
  count: number;
}

export interface AccountOverview {
  profile: PublicProfile;
  orderStatusSummary: AccountOrderStatusSummary[];
  recentOrders: PublicOrderSummary[];
  wallet: PublicWallet;
  wishlistCount: number;
  unreadNotificationCount: number;
  /** Paid and fulfilled order totals, minus refunds, in minor units. */
  totalSpentMinor: number;
  /** Loyalty points currently on the account. */
  pointsBalance: number;
  /** Taka value of those points, in poisha. 10 points = 1 taka. */
  pointsValueMinor: number;
  /** True when the admin has turned the points system on. */
  pointsEnabled: boolean;
}
