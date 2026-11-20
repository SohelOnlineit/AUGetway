import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export enum HomepageSectionTypeDto {
  FEATURED_PRODUCTS = "FEATURED_PRODUCTS",
  CATEGORY_PRODUCTS = "CATEGORY_PRODUCTS",
  LATEST_PRODUCTS = "LATEST_PRODUCTS",
}

export enum SitePageKeyDto {
  ABOUT = "ABOUT",
  CONTACT = "CONTACT",
  PRIVACY = "PRIVACY",
  TERMS = "TERMS",
  REFUND_POLICY = "REFUND_POLICY",
  DISCLAIMERS = "DISCLAIMERS",
}

export class UpsertHomepageSlideDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  subtitle?: string | null;

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertHomepageSectionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsEnum(HomepageSectionTypeDto)
  type!: HomepageSectionTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  categoryId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  productLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertNavigationItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  href!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertSitePageDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(200_000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoImageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  noindex?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
