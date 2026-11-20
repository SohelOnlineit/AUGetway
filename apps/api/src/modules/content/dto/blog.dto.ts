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
import { AdminPaginationQuery } from "../../admin/dto/admin-common.dto";

export enum BlogPostStatusDto {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

export class PublicBlogListQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 12;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}

export class AdminBlogListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsEnum(BlogPostStatusDto)
  status?: BlogPostStatusDto;
}

export class UpsertBlogCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertBlogPostDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  coverImagePath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  categoryId?: string | null;

  @IsOptional()
  @IsEnum(BlogPostStatusDto)
  status?: BlogPostStatusDto;

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
}

export class PublishBlogPostDto {
  @IsEnum(BlogPostStatusDto)
  status!: BlogPostStatusDto;
}
