import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class AccountDto {
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  currentPassword!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  newPassword?: string;
}

export class MethodDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  internalLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(800)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_800_000)
  qrImage?: string;

  @IsOptional()
  @IsIn(["transaction_id", "sender_number", "unique_amount"])
  verifyBy?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1440)
  payWindow?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(40)
  uniqueSlots?: number;

  @IsOptional()
  @IsIn(["integer", "decimal"])
  uniqueKind?: string;

  @IsOptional()
  @IsBoolean()
  acceptProof?: boolean;

  @IsOptional()
  @IsBoolean()
  holdUnmatched?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  holdAbove?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  underTolerance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  overTolerance?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  instructions?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedCharge?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentageCharge?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedDiscount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentageDiscount?: number;

  @IsOptional()
  @IsBoolean()
  shiftAmount?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class BulkIdsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class CheckoutDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  reference!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(250000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  successUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  cancelUrl?: string;
}

export class ChooseMethodDto {
  @IsString()
  methodId!: string;
}

export class ProofDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  providerRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  payerAccount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_800_000)
  receipt?: string;
}

export class BillDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  customerName!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(250000)
  total!: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export class LinkDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  detail?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(250000)
  amount!: number;
}

export class CustomerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class SettingsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  brandName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  checkoutNote?: string;

  @IsOptional()
  @IsObject()
  prefs?: Record<string, string>;
}

export class KeyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;

  @IsIn(["payment", "sms"])
  keyType!: "payment" | "sms";

  @IsIn(["auto", "custom"])
  generation!: "auto" | "custom";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  token?: string;

  @IsArray()
  @IsIn(
    ["payment:checkout", "payment:verify", "payment:refund", "sms:sync", "sms:receive", "sms:send"],
    { each: true },
  )
  abilities!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  expiresAt?: string;

  @IsBoolean()
  active!: boolean;
}

export class KeyStateDto {
  @IsBoolean()
  active!: boolean;
}

export class StartLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;
}

export class HandsetDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  simSlot!: number;
}

export class PulseDto {
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  uid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  battery?: number;
}

export class NoticeDto {
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  uid!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sender?: string;
}
