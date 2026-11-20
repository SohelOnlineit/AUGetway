import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { storefrontFromHeaders } from "../catalog/storefronts";
import { SitePageKey } from "../../generated/prisma/client";
import { BlogService } from "./blog.service";
import { CmsService } from "./cms.service";
import { ContactService } from "./contact.service";
import { PublicBlogListQuery } from "./dto/blog.dto";
import { CreateContactInquiryDto } from "./dto/contact.dto";
import { CreateProductRequestDto } from "./dto/product-request.dto";
import { ProductRequestService } from "./product-request.service";
import { UploadsService } from "./uploads.service";

@Controller("content")
export class ContentController {
  constructor(
    private readonly blog: BlogService,
    private readonly cms: CmsService,
    private readonly contact: ContactService,
    private readonly productRequests: ProductRequestService,
    private readonly uploads: UploadsService,
  ) {}

  @Get("blog/categories")
  listBlogCategories() {
    return this.blog.listPublicCategories();
  }

  @Get("blog/categories/:slug")
  getBlogCategory(@Param("slug") slug: string) {
    return this.blog.getPublicCategory(slug);
  }

  @Get("blog/posts")
  listBlogPosts(@Query() query: PublicBlogListQuery) {
    return this.blog.listPublicPosts(query);
  }

  @Get("blog/posts/:slug")
  getBlogPost(@Param("slug") slug: string) {
    return this.blog.getPublicPost(slug);
  }

  @Get("pages/:key")
  getPage(@Param("key") key: string) {
    const map: Record<string, SitePageKey> = {
      about: SitePageKey.ABOUT,
      contact: SitePageKey.CONTACT,
      privacy: SitePageKey.PRIVACY,
      privacy_policy: SitePageKey.PRIVACY,
      terms: SitePageKey.TERMS,
      terms_conditions: SitePageKey.TERMS,
      refund_policy: SitePageKey.REFUND_POLICY,
      refund_and_returns_policy: SitePageKey.REFUND_POLICY,
      disclaimers: SitePageKey.DISCLAIMERS,
      ABOUT: SitePageKey.ABOUT,
      CONTACT: SitePageKey.CONTACT,
      PRIVACY: SitePageKey.PRIVACY,
      TERMS: SitePageKey.TERMS,
      REFUND_POLICY: SitePageKey.REFUND_POLICY,
      DISCLAIMERS: SitePageKey.DISCLAIMERS,
    };
    const resolved =
      map[key] ?? map[key.toUpperCase().replace(/-/g, "_")] ?? null;
    if (!resolved) throw new NotFoundException("Page not found");
    return this.cms.getPublicPage(resolved);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("contact")
  createContact(@Body() dto: CreateContactInquiryDto, @Req() req: Request) {
    return this.contact.createPublic(dto, storefrontFromHeaders(req.headers));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("product-requests")
  createProductRequest(@Body() dto: CreateProductRequestDto, @Req() req: Request) {
    return this.productRequests.createPublic(dto, storefrontFromHeaders(req.headers));
  }

  @Get("favicon/:shop")
  faviconForShop(
    @Param("shop") shop: string,
    @Query("size") size: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sendFavicon(shop, size, res);
  }

  @Get("favicon")
  favicon(
    @Query("size") size: string | undefined,
    @Headers("x-storefront") storefront: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sendFavicon(storefront, size, res);
  }

  private async sendFavicon(storefront: string | undefined, size: string | undefined, res: Response) {
    const png = await this.uploads.faviconPng(storefront, Number(size));
    if (!png) throw new NotFoundException("Favicon not found");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "x-storefront");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(png);
  }

  @Get("media/:filename")
  async media(
    @Param("filename") filename: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.uploads.openPublicCmsFile(filename);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    if (file.contentType === "image/svg+xml") {
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    return new StreamableFile(file.stream);
  }

  @Get("seo/sitemap-entries")
  async sitemapEntries() {
    const [blog, pages] = await Promise.all([
      this.blog.listSitemapBlogEntries(),
      this.cms.listSitemapPages(),
    ]);
    return {
      blogPosts: blog.posts,
      blogCategories: blog.categories,
      pages,
    };
  }
}
