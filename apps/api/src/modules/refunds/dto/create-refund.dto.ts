import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateRefundDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  orderId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountMinor!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentIntentId?: string;
}
