import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreatePaymentIntentDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  orderId!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey?: string;
}
