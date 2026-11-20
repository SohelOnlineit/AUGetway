import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class TrackAnalyticsEventDto {
  @IsIn([
    "page_view",
    "product_view",
    "add_to_cart",
    "checkout_start",
    "search",
  ])
  name!:
    | "page_view"
    | "product_view"
    | "add_to_cart"
    | "checkout_start"
    | "search";

  @IsOptional()
  @IsString()
  @MaxLength(300)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  /** Opaque client key — hashed server-side; never an email. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  visitorKey?: string;
}

export class TrackPresenceDto {
  /** Opaque client key — hashed server-side; never an email. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  visitorKey!: string;
}
