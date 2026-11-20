import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ProductStatus, ProductType } from "../../../generated/prisma/client";
import { AdminPaginationQuery } from "./admin-common.dto";

export class AdminProductListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;
}

export class ReorderProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];
}

export class AdminProductImageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @IsOptional()
  @IsIn(["amarpin", "uniqbd"])
  storefront?: "amarpin" | "uniqbd";
}

export class AdminProductSeoDto {
  @IsIn(["amarpin", "uniqbd"])
  storefront!: "amarpin" | "uniqbd";

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
  @IsString()
  @MaxLength(300)
  keywords?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  canonicalPath?: string | null;

  @IsOptional()
  @IsBoolean()
  noindex?: boolean;

  @IsOptional()
  @IsBoolean()
  nofollow?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  shortDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  description?: string | null;
}

export class UpsertAdminProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @IsEnum(ProductStatus)
  status!: ProductStatus;

  @IsEnum(ProductType)
  type!: ProductType;

  @IsString()
  @MinLength(8)
  categoryId!: string;

  @IsOptional()
  @IsString()
  brandId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMinor!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compareAtMinor?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

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
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => AdminProductSeoDto)
  seoProfiles?: AdminProductSeoDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminProductImageDto)
  images?: AdminProductImageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminProductVariationMetaDto)
  variationMeta?: AdminProductVariationMetaDto | null;
}

export class AdminProductPackageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  valueId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMinor!: number;

  @IsIn(["manual", "giftcard", "api"])
  stockType!: "manual" | "giftcard" | "api";

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000_000)
  manualStock?: number;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  regions!: string[];
}

export class AdminRegionImageDto {
  @IsString()
  @MaxLength(40)
  region!: string;

  @IsString()
  @MaxLength(1000)
  imageUrl!: string;
}

export class AdminProductVariationMetaDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  regions!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  defaultRegion?: string;

  @IsOptional()
  @IsBoolean()
  showPackageImages?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminRegionImageDto)
  regionImages?: AdminRegionImageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminProductPackageDto)
  packages!: AdminProductPackageDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AdminCustomerInputDto)
  customerInputs?: AdminCustomerInputDto[];
}

export class AdminCustomerInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeholder?: string;

  @IsBoolean()
  required!: boolean;
}

export class UpsertAdminCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string;

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

export class UpsertAdminBrandDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  logoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

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
