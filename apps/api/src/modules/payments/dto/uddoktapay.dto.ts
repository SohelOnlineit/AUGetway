import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateUddoktaPayDto {
  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  sandbox!: boolean;

  @IsString()
  @MaxLength(200)
  baseUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  webhookSecret?: string;
}

export class VerifyUddoktaPayDto {
  @IsString()
  @MinLength(8)
  @MaxLength(40)
  orderId!: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  invoiceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  transactionId?: string;
}
