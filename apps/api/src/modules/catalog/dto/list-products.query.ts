import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class ListProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  pageSize?: number = 12;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @IsIn(["TOPUP", "GIFTCARD", "LICENSE", "ACCOUNT", "SUBSCRIPTION"])
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPriceMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceMinor?: number;

  @IsOptional()
  @IsString()
  @IsIn(["newest", "price_asc", "price_desc", "title"])
  sort?: "newest" | "price_asc" | "price_desc" | "title" = "newest";
}
