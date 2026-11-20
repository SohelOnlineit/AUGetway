import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AdminBlogCategory,
  AdminBlogPostDetail,
  AdminBlogPostListItem,
  AdminPage,
  PaginatedResult,
  PublicBlogCategory,
  PublicBlogPostDetail,
  PublicBlogPostSummary,
} from "@amarpin/types";
import {
  BlogPostStatus,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { blankText, cleanSeoImage } from "../../shared/seo-input";
import { slugify } from "../admin/admin.util";
import type {
  AdminBlogListQuery,
  PublicBlogListQuery,
  UpsertBlogCategoryDto,
  UpsertBlogPostDto,
} from "./dto/blog.dto";

const COVER_PATH_RE =
  /^\/api\/content\/media\/[a-f0-9]{32}\.(jpg|jpeg|png|webp)$/i;

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // —— Public (published only) ——

  async listPublicCategories(): Promise<PublicBlogCategory[]> {
    const rows = await this.prisma.blogCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            posts: { where: { status: BlogPostStatus.PUBLISHED } },
          },
        },
      },
    });
    return rows
      .filter((row) => row._count.posts > 0)
      .map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        seoImageUrl: row.seoImageUrl,
        noindex: row.noindex,
        postCount: row._count.posts,
      }));
  }

  async getPublicCategory(slug: string): Promise<PublicBlogCategory> {
    const row = await this.prisma.blogCategory.findFirst({
      where: { slug, isActive: true },
      include: {
        _count: {
          select: {
            posts: { where: { status: BlogPostStatus.PUBLISHED } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException("Category not found");
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoImageUrl: row.seoImageUrl,
      noindex: row.noindex,
      postCount: row._count.posts,
    };
  }

  async listPublicPosts(
    query: PublicBlogListQuery,
  ): Promise<PaginatedResult<PublicBlogPostSummary>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const where: Prisma.BlogPostWhereInput = {
      status: BlogPostStatus.PUBLISHED,
      publishedAt: { not: null },
    };
    if (query.category?.trim()) {
      where.category = { slug: query.category.trim(), isActive: true };
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { excerpt: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => this.mapPublicSummary(row)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getPublicPost(slug: string): Promise<PublicBlogPostDetail> {
    const row = await this.prisma.blogPost.findFirst({
      where: {
        slug,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        author: { select: { displayName: true } },
      },
    });
    if (!row) throw new NotFoundException("Post not found");
    return {
      ...this.mapPublicSummary(row),
      body: row.body,
      authorDisplayName: row.author?.displayName ?? null,
    };
  }

  async listSitemapBlogEntries(): Promise<{
    posts: { slug: string; updatedAt: Date }[];
    categories: { slug: string; updatedAt: Date }[];
  }> {
    const [posts, categories] = await Promise.all([
      this.prisma.blogPost.findMany({
        where: {
          status: BlogPostStatus.PUBLISHED,
          publishedAt: { not: null },
          noindex: false,
        },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.blogCategory.findMany({
        where: {
          isActive: true,
          noindex: false,
          posts: {
            some: {
              status: BlogPostStatus.PUBLISHED,
              publishedAt: { not: null },
            },
          },
        },
        select: { slug: true, updatedAt: true },
      }),
    ]);
    return { posts, categories };
  }

  // —— Admin ——

  async adminListCategories(): Promise<AdminBlogCategory[]> {
    const rows = await this.prisma.blogCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { posts: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoImageUrl: row.seoImageUrl,
      noindex: row.noindex,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      postCount: row._count.posts,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async adminCreateCategory(
    actorUserId: string,
    dto: UpsertBlogCategoryDto,
  ): Promise<AdminBlogCategory> {
    const name = dto.name.trim();
    const slug = await this.uniqueCategorySlug(dto.slug?.trim() || slugify(name));
    try {
      const row = await this.prisma.blogCategory.create({
        data: {
          name,
          slug,
          description: dto.description?.trim() || null,
          ...seoFields(dto),
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
        },
        include: { _count: { select: { posts: true } } },
      });
      await this.audit.record({
        action: "admin.blog.category_created",
        userId: actorUserId,
        entityType: "blog_category",
        entityId: row.id,
        metadata: { slug: row.slug },
      });
      return this.mapAdminCategory(row);
    } catch (error) {
      this.rethrowUnique(error, "Category slug already exists");
      throw error;
    }
  }

  async adminUpdateCategory(
    actorUserId: string,
    id: string,
    dto: UpsertBlogCategoryDto,
  ): Promise<AdminBlogCategory> {
    const existing = await this.prisma.blogCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Category not found");
    const name = dto.name.trim();
    let slug = existing.slug;
    if (dto.slug?.trim() && dto.slug.trim() !== existing.slug) {
      slug = await this.uniqueCategorySlug(dto.slug.trim(), id);
    } else if (name !== existing.name && !dto.slug) {
      slug = await this.uniqueCategorySlug(slugify(name), id);
    }
    try {
      const row = await this.prisma.blogCategory.update({
        where: { id },
        data: {
          name,
          slug,
          description: dto.description?.trim() || null,
          ...seoFields(dto),
          sortOrder: dto.sortOrder ?? existing.sortOrder,
          isActive: dto.isActive ?? existing.isActive,
        },
        include: { _count: { select: { posts: true } } },
      });
      await this.audit.record({
        action: "admin.blog.category_updated",
        userId: actorUserId,
        entityType: "blog_category",
        entityId: row.id,
        metadata: { slug: row.slug },
      });
      return this.mapAdminCategory(row);
    } catch (error) {
      this.rethrowUnique(error, "Category slug already exists");
      throw error;
    }
  }

  async adminListPosts(
    query: AdminBlogListQuery,
  ): Promise<AdminPage<AdminBlogPostListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.BlogPostWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => this.mapAdminListItem(row)),
      total,
      page,
      pageSize,
    };
  }

  async adminGetPost(id: string): Promise<AdminBlogPostDetail> {
    const row = await this.prisma.blogPost.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!row) throw new NotFoundException("Post not found");
    return this.mapAdminDetail(row);
  }

  async adminCreatePost(
    actorUserId: string,
    dto: UpsertBlogPostDto,
  ): Promise<AdminBlogPostDetail> {
    const title = dto.title.trim();
    const slug = await this.uniquePostSlug(dto.slug?.trim() || slugify(title));
    const coverImagePath = this.normalizeCover(dto.coverImagePath);
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    const status = (dto.status as BlogPostStatus | undefined) ?? BlogPostStatus.DRAFT;
    const publishedAt =
      status === BlogPostStatus.PUBLISHED ? new Date() : null;

    try {
      const row = await this.prisma.blogPost.create({
        data: {
          title,
          slug,
          excerpt: dto.excerpt?.trim() || null,
          body: dto.body,
          coverImagePath,
          categoryId: dto.categoryId || null,
          authorUserId: actorUserId,
          status,
          publishedAt,
          ...seoFields(dto),
        },
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      });
      await this.audit.record({
        action: "admin.blog.post_created",
        userId: actorUserId,
        entityType: "blog_post",
        entityId: row.id,
        metadata: { slug: row.slug, status: row.status },
      });
      return this.mapAdminDetail(row);
    } catch (error) {
      this.rethrowUnique(error, "Post slug already exists");
      throw error;
    }
  }

  async adminUpdatePost(
    actorUserId: string,
    id: string,
    dto: UpsertBlogPostDto,
  ): Promise<AdminBlogPostDetail> {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Post not found");
    const title = dto.title.trim();
    let slug = existing.slug;
    if (dto.slug?.trim() && dto.slug.trim() !== existing.slug) {
      slug = await this.uniquePostSlug(dto.slug.trim(), id);
    }
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    const coverImagePath = this.normalizeCover(dto.coverImagePath);
    const status =
      (dto.status as BlogPostStatus | undefined) ?? existing.status;
    let publishedAt = existing.publishedAt;
    if (status === BlogPostStatus.PUBLISHED && !publishedAt) {
      publishedAt = new Date();
    }
    if (status !== BlogPostStatus.PUBLISHED) {
      publishedAt = status === BlogPostStatus.DRAFT ? null : existing.publishedAt;
    }

    try {
      const row = await this.prisma.blogPost.update({
        where: { id },
        data: {
          title,
          slug,
          excerpt: dto.excerpt?.trim() || null,
          body: dto.body,
          coverImagePath,
          categoryId: dto.categoryId === undefined ? existing.categoryId : dto.categoryId || null,
          status,
          publishedAt,
          ...seoFields(dto),
        },
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      });
      await this.audit.record({
        action: "admin.blog.post_updated",
        userId: actorUserId,
        entityType: "blog_post",
        entityId: row.id,
        metadata: { slug: row.slug, status: row.status },
      });
      return this.mapAdminDetail(row);
    } catch (error) {
      this.rethrowUnique(error, "Post slug already exists");
      throw error;
    }
  }

  async adminSetPostStatus(
    actorUserId: string,
    id: string,
    status: BlogPostStatus,
  ): Promise<AdminBlogPostDetail> {
    const existing = await this.prisma.blogPost.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!existing) throw new NotFoundException("Post not found");

    let publishedAt = existing.publishedAt;
    if (status === BlogPostStatus.PUBLISHED && !publishedAt) {
      publishedAt = new Date();
    }
    if (status === BlogPostStatus.DRAFT) publishedAt = null;

    const row = await this.prisma.blogPost.update({
      where: { id },
      data: { status, publishedAt },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });
    await this.audit.record({
      action: "admin.blog.post_status",
      userId: actorUserId,
      entityType: "blog_post",
      entityId: row.id,
      metadata: { status: row.status },
    });
    return this.mapAdminDetail(row);
  }

  private normalizeCover(path?: string | null): string | null {
    if (path == null || path === "") return null;
    const trimmed = path.trim();
    if (!COVER_PATH_RE.test(trimmed)) {
      throw new BadRequestException(
        "coverImagePath must be an uploaded CMS media path",
      );
    }
    return trimmed;
  }

  private async assertCategory(id: string) {
    const cat = await this.prisma.blogCategory.findUnique({ where: { id } });
    if (!cat) throw new BadRequestException("Invalid categoryId");
  }

  private async uniqueCategorySlug(base: string, excludeId?: string) {
    const root = slugify(base) || "category";
    for (let i = 0; i < 50; i += 1) {
      const candidate = i === 0 ? root : `${root}-${i + 1}`;
      const found = await this.prisma.blogCategory.findUnique({
        where: { slug: candidate },
      });
      if (!found || found.id === excludeId) return candidate;
    }
    throw new ConflictException("Unable to allocate category slug");
  }

  private async uniquePostSlug(base: string, excludeId?: string) {
    const root = slugify(base) || "post";
    for (let i = 0; i < 50; i += 1) {
      const candidate = i === 0 ? root : `${root}-${i + 1}`;
      const found = await this.prisma.blogPost.findUnique({
        where: { slug: candidate },
      });
      if (!found || found.id === excludeId) return candidate;
    }
    throw new ConflictException("Unable to allocate post slug");
  }

  private rethrowUnique(error: unknown, message: string) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new ConflictException(message);
    }
  }

  private mapPublicSummary(row: {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    coverImagePath: string | null;
    publishedAt: Date | null;
    updatedAt: Date;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageUrl: string | null;
    noindex: boolean;
    category: { id: string; name: string; slug: string } | null;
  }): PublicBlogPostSummary {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      coverImagePath: row.coverImagePath,
      publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      category: row.category,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoImageUrl: row.seoImageUrl,
      noindex: row.noindex,
    };
  }

  private mapAdminCategory(row: {
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
    createdAt: Date;
    updatedAt: Date;
    _count: { posts: number };
  }): AdminBlogCategory {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoImageUrl: row.seoImageUrl,
      noindex: row.noindex,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      postCount: row._count.posts,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapAdminListItem(row: {
    id: string;
    title: string;
    slug: string;
    status: BlogPostStatus;
    coverImagePath: string | null;
    publishedAt: Date | null;
    updatedAt: Date;
    category: { id: string; name: string; slug: string } | null;
  }): AdminBlogPostListItem {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      coverImagePath: row.coverImagePath,
      category: row.category,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapAdminDetail(row: {
    id: string;
    title: string;
    slug: string;
    status: BlogPostStatus;
    coverImagePath: string | null;
    excerpt: string | null;
    body: string;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageUrl: string | null;
    noindex: boolean;
    authorUserId: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    category: { id: string; name: string; slug: string } | null;
  }): AdminBlogPostDetail {
    return {
      ...this.mapAdminListItem(row),
      excerpt: row.excerpt,
      body: row.body,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoImageUrl: row.seoImageUrl,
      noindex: row.noindex,
      authorUserId: row.authorUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function seoFields(dto: {
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoImageUrl?: string | null;
  noindex?: boolean;
}) {
  return {
    ...(dto.seoTitle !== undefined ? { seoTitle: blankText(dto.seoTitle) } : {}),
    ...(dto.seoDescription !== undefined ? { seoDescription: blankText(dto.seoDescription) } : {}),
    ...(dto.seoImageUrl !== undefined ? { seoImageUrl: cleanSeoImage(dto.seoImageUrl) } : {}),
    ...(dto.noindex !== undefined ? { noindex: dto.noindex } : {}),
  };
}
