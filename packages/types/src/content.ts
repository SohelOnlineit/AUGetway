export type BlogPostStatusPublic = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type SitePageKeyPublic =
  | "ABOUT"
  | "CONTACT"
  | "PRIVACY"
  | "TERMS"
  | "REFUND_POLICY"
  | "DISCLAIMERS";

export type ContactInquiryStatusPublic =
  | "NEW"
  | "READ"
  | "REPLIED"
  | "CLOSED";

export type ContactMessageDirectionPublic = "INBOUND" | "OUTBOUND";

export type ContactReplyDeliveryStatusPublic =
  | "NOT_APPLICABLE"
  | "PENDING"
  | "SKIPPED_NO_PROVIDER"
  | "FAILED"
  | "ACCEPTED";

export type ProductRequestStatusPublic =
  | "NEW"
  | "REVIEWING"
  | "REPLIED"
  | "CLOSED";

export interface PublicBlogCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
  postCount: number;
}

export interface PublicBlogPostSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImagePath: string | null;
  publishedAt: string;
  updatedAt: string;
  category: { id: string; name: string; slug: string } | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
}

export interface PublicBlogPostDetail extends PublicBlogPostSummary {
  body: string;
  authorDisplayName: string | null;
}

export interface PublicSitePage {
  key: SitePageKeyPublic;
  title: string;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
  updatedAt: string;
}

export interface ContactInquiryCreateResult {
  id: string;
  status: ContactInquiryStatusPublic;
  createdAt: string;
}

export interface ProductRequestCreateResult {
  id: string;
  status: ProductRequestStatusPublic;
  createdAt: string;
}

export interface AdminBlogCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
  sortOrder: number;
  isActive: boolean;
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBlogPostListItem {
  id: string;
  title: string;
  slug: string;
  status: BlogPostStatusPublic;
  coverImagePath: string | null;
  category: { id: string; name: string; slug: string } | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AdminBlogPostDetail extends AdminBlogPostListItem {
  excerpt: string | null;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
  authorUserId: string | null;
  createdAt: string;
}

export interface AdminHomepageSlide {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}

export interface AdminHomepageSection {
  id: string;
  title: string;
  type: "FEATURED_PRODUCTS" | "CATEGORY_PRODUCTS" | "LATEST_PRODUCTS";
  categoryId: string | null;
  categoryName: string | null;
  productLimit: number;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}

export interface AdminNavigationItem {
  id: string;
  label: string;
  href: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}

export interface AdminSitePage {
  key: SitePageKeyPublic;
  title: string;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
  isPublished: boolean;
  updatedAt: string;
}

export interface AdminContactMessage {
  id: string;
  direction: ContactMessageDirectionPublic;
  body: string;
  deliveryStatus: ContactReplyDeliveryStatusPublic;
  deliveryDetail: string | null;
  createdAt: string;
}

export interface AdminContactListItem {
  id: string;
  name: string;
  email: string;
  subject: string;
  status: ContactInquiryStatusPublic;
  createdAt: string;
  updatedAt: string;
}

export interface AdminContactDetail extends AdminContactListItem {
  messages: AdminContactMessage[];
}

export interface AdminProductRequestListItem {
  id: string;
  productName: string;
  customerName: string;
  email: string;
  mobile: string;
  status: ProductRequestStatusPublic;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductRequestDetail extends AdminProductRequestListItem {
  details: string;
  adminReply: string | null;
  replyDeliveryStatus: ContactReplyDeliveryStatusPublic;
  replyDeliveryDetail: string | null;
  repliedAt: string | null;
}

export interface AdminUploadResult {
  path: string;
  contentType: string;
  bytes: number;
}
