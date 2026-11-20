import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CheckoutDto {
  /**
   * Optional body key; Prefer Idempotency-Key header.
   * Must be unique per user when provided.
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey?: string;

  /** Optional code only. Discount amount is computed on the server. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  couponCode?: string;

  /** Storefront sales channel. Gateway checkout is recorded as Direct. */
  @IsOptional()
  @IsIn(["gateway", "wallet"])
  paymentMethod?: "gateway" | "wallet";

  /** Website the customer arrived from. The server normalizes this. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  originSource?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(30)
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  contactEmail?: string;
}
