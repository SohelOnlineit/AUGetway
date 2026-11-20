import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { SEO_LOCALES } from "../../../shared/seo-profile";
import { SEO_VERIFIERS } from "@amarpin/types";

const VERIFIER_IDS = SEO_VERIFIERS.map((item) => item.id);

export const ROUTE_SEO_KEYS = ["HOME", "PRODUCTS", "BLOG", "REQUEST_PRODUCT"] as const;
export type RouteSeoKeyDto = (typeof ROUTE_SEO_KEYS)[number];

export class UpdateAdminSeoSettingsDto {
  @IsIn(["amarpin", "uniqbd"])
  shop!: "amarpin" | "uniqbd";

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  siteName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  tagline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultSeoTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  defaultSeoDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  canonicalBaseUrl?: string | null;

  /** Extra Disallow lines only (one path per line). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  robotsExtra?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  defaultOgImageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  indexing?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  titleSuffix?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  twitterHandle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  googleSiteVerification?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bingSiteVerification?: string | null;

  @IsOptional()
  @IsIn(SEO_LOCALES)
  ogLocale?: (typeof SEO_LOCALES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sameAs?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => SeoVerificationDto)
  verifications?: SeoVerificationDto[];
}

export class SeoVerificationDto {
  @IsIn(VERIFIER_IDS)
  provider!: (typeof VERIFIER_IDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string | null;

  @IsString()
  @MaxLength(160)
  code!: string;
}

export class UpdateAdminRouteSeoDto {
  @IsIn(["amarpin", "uniqbd"])
  shop!: "amarpin" | "uniqbd";

  @IsIn(ROUTE_SEO_KEYS)
  key!: RouteSeoKeyDto;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  canonicalPath?: string | null;

  @IsOptional()
  @IsBoolean()
  noindex?: boolean;

  @IsOptional()
  @IsBoolean()
  nofollow?: boolean;
}
