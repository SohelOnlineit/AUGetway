import { Controller, Get, Headers, Param, Query } from "@nestjs/common";
import { ReviewsService } from "../promotions/reviews.service";
import { CatalogService } from "./catalog.service";
import { PublicReviewFeedQuery } from "../promotions/dto/review.dto";
import { ListProductsQueryDto } from "./dto/list-products.query";

@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get("categories")
  listCategories() {
    return this.catalog.listCategories();
  }

  @Get("categories/:slug")
  getCategory(@Param("slug") slug: string) {
    return this.catalog.getCategoryBySlug(slug);
  }

  @Get("brands")
  listBrands() {
    return this.catalog.listBrands();
  }

  @Get("brands/:slug")
  getBrand(@Param("slug") slug: string) {
    return this.catalog.getBrandBySlug(slug);
  }

  @Get("products")
  listProducts(
    @Query() query: ListProductsQueryDto,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.catalog.listProducts(query, storefront);
  }

  @Get("products/:slug")
  getProduct(
    @Param("slug") slug: string,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.catalog.getProductBySlug(slug, storefront);
  }

  @Get("reviews")
  publicReviews(@Query() query: PublicReviewFeedQuery) {
    return this.reviews.publicFeed(query);
  }

  @Get("products/:slug/reviews")
  async productReviews(
    @Param("slug") slug: string,
    @Headers("x-storefront") storefront?: string,
  ) {
    const product = await this.catalog.getProductBySlug(slug, storefront);
    return this.reviews.listPublic(product.id);
  }

  @Get("search")
  search(
    @Query() query: ListProductsQueryDto,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.catalog.listProducts(query, storefront);
  }

  @Get("homepage")
  homepage(@Headers("x-storefront") storefront?: string) {
    return this.catalog.getHomepage(storefront);
  }

  @Get("site-content")
  siteContent(@Headers("x-storefront") storefront?: string) {
    return this.catalog.getSiteContent(storefront);
  }

  @Get("seo/sitemap-entries")
  sitemapEntries(@Headers("x-storefront") storefront?: string) {
    return this.catalog.listSitemapEntries(storefront);
  }
}
