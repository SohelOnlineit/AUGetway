import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AccountProductReview,
  AdminProductReview,
  AdminReviewListPage,
  PublicProductReview,
  PublicReviewFeed,
} from "@amarpin/types";
import {
  OrderStatus,
  ProductStatus,
  ReviewStatus,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { AdminPaginationQuery } from "../admin/dto/admin-common.dto";
import type { UpsertReviewDto } from "./dto/review.dto";

const VERIFIED_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.FULFILLED,
  OrderStatus.PARTIALLY_REFUNDED,
];

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPublic(productId: string): Promise<PublicProductReview[]> {
    const rows = await this.prisma.productReview.findMany({
      where: { productId, status: ReviewStatus.APPROVED },
      include: { user: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      body: row.body,
      verifiedPurchase: row.verifiedPurchase,
      authorDisplayName: row.user.displayName,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async publicFeed(query: {
    page?: number;
    q?: string;
    category?: string;
    product?: string;
  }): Promise<PublicReviewFeed> {
    const pageSize = 12;
    const page = Math.min(Math.max(query.page ?? 1, 1), 500);
    const q = query.q?.trim() ?? "";
    const category = query.category?.trim() ?? "";
    const product = query.product?.trim() ?? "";
    const where: Prisma.ProductReviewWhereInput = { status: ReviewStatus.APPROVED };
    const productFilter: Prisma.ProductWhereInput = {};
    if (product) productFilter.slug = product;
    if (category) productFilter.category = { slug: category };
    if (product || category) where.product = productFilter;
    if (q) {
      where.AND = [
        {
          OR: [
            { body: { contains: q, mode: "insensitive" } },
            { user: { displayName: { contains: q, mode: "insensitive" } } },
            { product: { title: { contains: q, mode: "insensitive" } } },
            { product: { category: { name: { contains: q, mode: "insensitive" } } } },
          ],
        },
      ];
    }

    const [total, rows, grouped, categories, products] = await Promise.all([
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.findMany({
        where,
        include: {
          user: { select: { displayName: true } },
          product: {
            select: {
              title: true,
              slug: true,
              category: { select: { name: true, slug: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.productReview.groupBy({
        by: ["productId"],
        where: { status: ReviewStatus.APPROVED },
        _count: { _all: true },
      }),
      this.prisma.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.product.findMany({
        where: { status: ProductStatus.ACTIVE },
        select: { id: true, title: true, slug: true, categoryId: true },
        orderBy: { title: "asc" },
      }),
    ]);

    const byProduct = new Map(grouped.map((row) => [row.productId, row._count._all]));
    const byCategory = new Map<string, number>();
    for (const item of products) {
      byCategory.set(item.categoryId, (byCategory.get(item.categoryId) ?? 0) + (byProduct.get(item.id) ?? 0));
    }

    return {
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      reviews: rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        body: row.body,
        verifiedPurchase: row.verifiedPurchase,
        authorDisplayName: row.user.displayName,
        createdAt: row.createdAt.toISOString(),
        productTitle: row.product.title,
        productSlug: row.product.slug,
        categoryName: row.product.category.name,
        categorySlug: row.product.category.slug,
      })),
      categories: categories
        .map((item) => ({
          id: item.id,
          name: item.name,
          slug: item.slug,
          count: byCategory.get(item.id) ?? 0,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      products: products
        .map((item) => ({
          id: item.id,
          name: item.title,
          slug: item.slug,
          count: byProduct.get(item.id) ?? 0,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  }

  async listMine(userId: string): Promise<AccountProductReview[]> {
    const rows = await this.prisma.productReview.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => this.mapAccount(row));
  }

  async upsertMine(
    userId: string,
    productId: string,
    dto: UpsertReviewDto,
  ): Promise<AccountProductReview> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException("Product not found");

    const body = dto.body.trim();
    if (body.length < 8) throw new BadRequestException("Review is too short");
    const verifiedPurchase = await this.hasVerifiedPurchase(userId, productId);
    if (!verifiedPurchase) {
      throw new BadRequestException(
        "Only customers with a paid purchase of this product can review it",
      );
    }

    try {
      const row = await this.prisma.productReview.upsert({
        where: { productId_userId: { productId, userId } },
        create: {
          productId,
          userId,
          rating: dto.rating,
          body,
          status: ReviewStatus.PENDING,
          verifiedPurchase: true,
        },
        update: {
          rating: dto.rating,
          body,
          verifiedPurchase: true,
          status: ReviewStatus.PENDING,
        },
      });
      await this.recomputeAggregate(productId);
      await this.audit.record({
        action: "review.upserted",
        userId,
        entityType: "product_review",
        entityId: row.id,
        metadata: { productId, status: row.status },
      });
      return this.mapAccount(row);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        throw new ConflictException("You already reviewed this product");
      }
      throw error;
    }
  }

  async adminList(
    query: AdminPaginationQuery & { status?: ReviewStatus; rating?: number },
  ): Promise<AdminReviewListPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ProductReviewWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.rating) where.rating = query.rating;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { body: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { displayName: { contains: q, mode: "insensitive" } } },
        { product: { title: { contains: q, mode: "insensitive" } } },
      ];
    }
    const [total, rows, everyone, pending, published, rejected, average] = await Promise.all([
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.findMany({
        where,
        include: {
          user: { select: { email: true, displayName: true } },
          product: { select: { title: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.productReview.count(),
      this.prisma.productReview.count({ where: { status: ReviewStatus.PENDING } }),
      this.prisma.productReview.count({ where: { status: ReviewStatus.APPROVED } }),
      this.prisma.productReview.count({ where: { status: ReviewStatus.REJECTED } }),
      this.prisma.productReview.aggregate({
        where: { status: ReviewStatus.APPROVED },
        _avg: { rating: true },
      }),
    ]);
    return {
      items: rows.map((row) => this.mapAdmin(row)),
      total,
      page,
      pageSize,
      stats: {
        total: everyone,
        pending,
        published,
        rejected,
        averageRating: average._avg.rating,
      },
    };
  }

  async adminSetStatus(
    actorUserId: string,
    id: string,
    status: ReviewStatus,
  ): Promise<AdminProductReview> {
    const existing = await this.prisma.productReview.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, displayName: true } },
        product: { select: { title: true, slug: true } },
      },
    });
    if (!existing) throw new NotFoundException("Review not found");
    const row = await this.prisma.productReview.update({
      where: { id },
      data: { status },
      include: {
        user: { select: { email: true, displayName: true } },
        product: { select: { title: true, slug: true } },
      },
    });
    await this.recomputeAggregate(row.productId);
    await this.audit.record({
      action: "admin.review.status",
      userId: actorUserId,
      entityType: "product_review",
      entityId: id,
      metadata: { from: existing.status, to: status, productId: row.productId },
    });
    return this.mapAdmin(row);
  }

  private mapAdmin(row: {
    id: string;
    productId: string;
    userId: string;
    rating: number;
    body: string;
    status: ReviewStatus;
    verifiedPurchase: boolean;
    createdAt: Date;
    updatedAt: Date;
    user: { email: string; displayName: string | null };
    product: { title: string; slug: string };
  }): AdminProductReview {
    return {
      id: row.id,
      productId: row.productId,
      productTitle: row.product.title,
      productSlug: row.product.slug,
      userId: row.userId,
      authorEmail: row.user.email,
      authorDisplayName: row.user.displayName,
      rating: row.rating,
      body: row.body,
      status: row.status,
      verifiedPurchase: row.verifiedPurchase,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async hasVerifiedPurchase(userId: string, productId: string) {
    const count = await this.prisma.orderItem.count({
      where: {
        productId,
        order: { userId, status: { in: VERIFIED_STATUSES } },
      },
    });
    return count > 0;
  }

  /** Recount approved reviews only so public aggregates stay consistent. */
  private async recomputeAggregate(productId: string) {
    const agg = await this.prisma.productReview.aggregate({
      where: { productId, status: ReviewStatus.APPROVED },
      _count: { _all: true },
      _sum: { rating: true },
    });
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        ratingCount: agg._count._all,
        ratingSum: agg._sum.rating ?? 0,
      },
    });
  }

  private mapAccount(row: {
    id: string;
    productId: string;
    rating: number;
    body: string;
    status: ReviewStatus;
    verifiedPurchase: boolean;
    updatedAt: Date;
  }): AccountProductReview {
    return {
      id: row.id,
      productId: row.productId,
      rating: row.rating,
      body: row.body,
      status: row.status,
      verifiedPurchase: row.verifiedPurchase,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
