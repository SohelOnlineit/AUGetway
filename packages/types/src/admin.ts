import type {
  PublicWallet,
  PublicWalletTransaction,
} from "./account";
import type {
  FulfillmentStatusPublic,
  OrderStatusPublic,
  PublicCustomerAnswer,
} from "./commerce";
import type { Permission } from "./index";
import type { SeoVerificationLink } from "./catalog";

export type AdminProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type AdminProductType =
  | "LICENSE"
  | "ACCOUNT"
  | "GIFTCARD"
  | "TOPUP"
  | "SUBSCRIPTION";

export type AdminInventoryStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "DISABLED";

export interface AdminSession {
  userId: string;
  roles: string[];
  permissions: Permission[];
}

export interface AdminDashboardSummary {
  productsTotal: number;
  productsActive: number;
  ordersPendingPayment: number;
  ordersPaid: number;
  ordersFulfilled: number;
  customersTotal: number;
  inventoryAvailable: number;
  inventoryReserved: number;
  recentAuditCount: number;
  openTickets: number;
  analyticsLast7d: AdminAnalyticsSummary;
}

export interface AdminDashboardDelivery {
  orderId: string;
  orderNumber: string;
  title: string;
  region: string | null;
  code: string;
  deliveredAt: string;
}

export type AnalyticsEventNamePublic =
  | "page_view"
  | "product_view"
  | "add_to_cart"
  | "checkout_start"
  | "search";

export interface AdminAnalyticsSummary {
  windowDays: number;
  totals: Record<AnalyticsEventNamePublic, number>;
  topPaths: Array<{ path: string; count: number }>;
}

export interface AdminAnalyticsLive {
  online: number;
  windowSeconds: number;
  updatedAt: string;
}

export interface AdminSeoSettings {
  shop: "amarpin" | "uniqbd";
  siteName: string;
  tagline: string | null;
  defaultSeoTitle: string | null;
  defaultSeoDescription: string | null;
  canonicalBaseUrl: string | null;
  robotsExtra: string | null;
  defaultOgImageUrl: string | null;
  indexing: boolean;
  titleSuffix: string | null;
  twitterHandle: string | null;
  googleSiteVerification: string | null;
  bingSiteVerification: string | null;
  ogLocale: "en_US" | "en_GB" | "bn_BD";
  sameAs: string | null;
  verifications: SeoVerificationLink[];
  updatedAt: string;
}

export interface AdminRouteSeo {
  key: "HOME" | "PRODUCTS" | "BLOG" | "REQUEST_PRODUCT";
  path: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  canonicalPath: string | null;
  noindex: boolean;
  nofollow: boolean;
  updatedAt: string;
}

export interface StorefrontBrand {
  id: "amarpin" | "uniqbd";
  siteName: string;
  logoAlt: string;
  lightLogoPath: string | null;
  darkLogoPath: string | null;
  faviconPath: string | null;
}

export interface AdminAppearance {
  brands: StorefrontBrand[];
  updatedAt: string;
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductListItem {
  id: string;
  title: string;
  slug: string;
  status: AdminProductStatus;
  type: AdminProductType;
  priceMinor: number;
  currency: string;
  featured: boolean;
  sku: string | null;
  imageUrl: string | null;
  category: { id: string; name: string; slug: string };
  brand: { id: string; name: string; slug: string } | null;
  stockAvailable: number;
  stockReserved: number;
  stockSold: number;
  updatedAt: string;
}

export type AdminPackageStockType = "manual" | "giftcard" | "api";

export interface AdminProductPackage {
  name: string;
  valueId: string;
  priceMinor: number;
  stockType: AdminPackageStockType;
  imageUrl: string | null;
  manualStock: number;
  regions: string[];
}

export interface AdminRegionImage {
  region: string;
  imageUrl: string;
}

export interface AdminCustomerInput {
  label: string;
  placeholder: string;
  required: boolean;
}

export interface AdminProductVariationMeta {
  regions: string[];
  defaultRegion: string;
  showPackageImages: boolean;
  regionImages: AdminRegionImage[];
  packages: AdminProductPackage[];
  customerInputs: AdminCustomerInput[];
}

export interface AdminProductSeo {
  storefront: "amarpin" | "uniqbd";
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  keywords: string | null;
  canonicalPath: string | null;
  noindex: boolean;
  nofollow: boolean;
  shortDescription: string | null;
  description: string | null;
}

export interface AdminProductDetail extends AdminProductListItem {
  description: string | null;
  shortDescription: string | null;
  sku: string | null;
  compareAtMinor: number | null;
  sortOrder: number;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
  seoProfiles: AdminProductSeo[];
  publishedAt: string | null;
  images: Array<{
    id: string;
    url: string;
    alt: string | null;
    sortOrder: number;
    storefront: "amarpin" | "uniqbd";
  }>;
  variationMeta: AdminProductVariationMeta | null;
  createdAt: string;
}

export interface AdminInventoryUnit {
  id: string;
  productId: string;
  packageValueId: string | null;
  status: AdminInventoryStatus;
  /** Full stock code for the admin list. Do not log it. */
  codeMasked: string;
  reservedOrderId: string | null;
  reservedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatusPublic;
  fulfillmentStatus: FulfillmentStatusPublic;
  totalMinor: number;
  currency: string;
  customerEmail: string;
  customerName: string | null;
  customerId: string;
  itemCount: number;
  productTitle: string | null;
  productImageUrl: string | null;
  /** Website the customer came from. Direct means they did not arrive from another site. */
  origin: string;
  /** Shop domain the customer used, amarpin.com or uniqbd.com. */
  webDomain: string;
  createdAt: string;
  paidAt: string | null;
  /** bKash, Nagad, Rocket, or Wallet when known. */
  paymentMethod: string | null;
  /** Mobile-wallet transaction id, when the gateway sent one. */
  transactionId: string | null;
}

export interface AdminOrderStats {
  all: number;
  pending: number;
  paid: number;
  completed: number;
  cancelled: number;
  refunded: number;
  trash: number;
}

export interface AdminOrderPaymentInfo {
  orderId: string;
  orderNumber: string;
  status: OrderStatusPublic;
  totalMinor: number;
  currency: string;
  paidAt: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
  invoiceId: string | null;
  paymentStatus: string | null;
}

export interface AdminOrderListPage extends AdminPage<AdminOrderListItem> {
  stats: AdminOrderStats;
  origins: string[];
  payment: AdminOrderPaymentInfo | null;
}

export interface AdminOrderDetail extends AdminOrderListItem {
  subtotalMinor: number;
  refundedMinor: number;
  reservationExpiresAt: string;
  fulfilledAt: string | null;
  items: Array<{
    id: string;
    productId: string;
    titleSnapshot: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
    imageUrl: string | null;
    packageName: string | null;
    region: string | null;
    deliveryLabel: string | null;
    customerInputs: PublicCustomerAnswer[];
  }>;
  /** Delivery codes are intentionally omitted for admin. */
  deliveryCount: number;
  /** Masked cards kept on this order after it is completed. */
  giftCards: Array<{
    inventoryItemId: string;
    title: string;
    region: string | null;
    faceValue: string | null;
    codeMasked: string;
    amountMinor: number | null;
  }>;
  allowedActions: Array<"CANCEL_PENDING" | "MARK_COMPLETE">;
}

export interface AdminCustomerListItem {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  emailVerified: boolean;
  roles: string[];
  orderCount: number;
  walletBalanceMinor: number;
  currency: string;
  createdAt: string;
}

export interface AdminCustomerStats {
  total: number;
  active: number;
  pending: number;
  suspended: number;
  withBalance: number;
  walletMinor: number;
  joinedToday: number;
}

export interface AdminCustomerListPage extends AdminPage<AdminCustomerListItem> {
  stats: AdminCustomerStats;
}

export interface AdminCustomerDetail extends AdminCustomerListItem {
  phoneMasked: string | null;
  adminNote: string | null;
  avatarUrl: string | null;
  wallet: PublicWallet | null;
  recentOrders: AdminOrderListItem[];
}

export interface AdminAuditListItem {
  id: string;
  action: string;
  actorUserId: string | null;
  actorEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export interface AdminAuditDetail extends AdminAuditListItem {
  /** Scrubbed metadata — never secrets/codes. */
  metadata: Record<string, unknown> | null;
  ipHash: string | null;
}

export interface AdminWalletAdjustResult {
  wallet: PublicWallet;
  transaction: PublicWalletTransaction;
}

export interface AdminWalletAccount {
  userId: string;
  email: string;
  displayName: string | null;
  status: string;
  balanceMinor: number;
  currency: string;
  updatedAt: string | null;
  lastTransactionAt: string | null;
}

export interface AdminWalletStats {
  accounts: number;
  withBalance: number;
  zeroBalance: number;
  totalBalanceMinor: number;
  creditsTodayMinor: number;
  debitsTodayMinor: number;
  postedToday: number;
  currency: string;
}

export interface AdminWalletListPage extends AdminPage<AdminWalletAccount> {
  stats: AdminWalletStats;
}

export interface AdminWalletActivityItem {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  type: "CREDIT" | "DEBIT";
  amountMinor: number;
  balanceAfterMinor: number;
  currency: string;
  description: string | null;
  referenceType: string | null;
  createdAt: string;
}

export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
