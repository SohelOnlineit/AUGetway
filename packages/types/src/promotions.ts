import type { AdminPage } from "./admin";

export type CouponDiscountTypePublic = "PERCENT" | "FIXED";
export type CouponRedemptionStatusPublic = "HELD" | "CONSUMED" | "RELEASED";
export type ReviewStatusPublic = "PENDING" | "APPROVED" | "REJECTED";

export interface CouponQuote {
  code: string;
  discountMinor: number;
  currency: string;
  eligibleSubtotalMinor: number;
}

export interface AdminCoupon {
  id: string;
  code: string;
  discountType: CouponDiscountTypePublic;
  percent: number | null;
  amountMinor: number | null;
  currency: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  minSubtotalMinor: number;
  productIds: string[];
  categoryIds: string[];
  heldCount: number;
  consumedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProductReview {
  id: string;
  rating: number;
  body: string;
  verifiedPurchase: boolean;
  authorDisplayName: string | null;
  createdAt: string;
}

export interface PublicReviewCard extends PublicProductReview {
  productTitle: string;
  productSlug: string;
  categoryName: string;
  categorySlug: string;
}

export interface PublicReviewFacet {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export interface PublicReviewFeed {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  reviews: PublicReviewCard[];
  categories: PublicReviewFacet[];
  products: PublicReviewFacet[];
}

export interface AccountProductReview {
  id: string;
  productId: string;
  rating: number;
  body: string;
  status: ReviewStatusPublic;
  verifiedPurchase: boolean;
  updatedAt: string;
}

export interface AdminProductReview {
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  userId: string;
  authorEmail: string;
  authorDisplayName: string | null;
  rating: number;
  body: string;
  status: ReviewStatusPublic;
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReviewStats {
  total: number;
  pending: number;
  published: number;
  rejected: number;
  averageRating: number | null;
}

export interface AdminReviewListPage extends AdminPage<AdminProductReview> {
  stats: AdminReviewStats;
}
