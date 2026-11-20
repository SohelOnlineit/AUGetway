import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export enum CouponDiscountTypeDto {
  PERCENT = "PERCENT",
  FIXED = "FIXED",
}

export class UpsertCouponDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @IsEnum(CouponDiscountTypeDto)
  discountType!: CouponDiscountTypeDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  percent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRedemptions?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxPerCustomer?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSubtotalMinor?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];
}

export class QuoteCouponDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;
}
