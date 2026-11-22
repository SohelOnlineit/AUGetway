import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
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
  ValidateNested,
} from "class-validator";

export class LoginDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  // Old passwords can be 8 characters, so sign-in keeps accepting those. Only a new password needs 10.
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsIn(["desk", "handset"])
  client?: string;

  /** Cloudflare Turnstile result. Needed only while the check is on. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}

export class UpdateTurnstileDto {
  /** Leave out to keep the saved site key. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteKey?: string;

  /** Leave out or empty to keep the saved secret. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  secretKey?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** A passed test, needed to turn the check on. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}

export class StartBillDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}

export class AdminDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(80)
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

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
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
  @MaxLength(80)
  logoCaption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(800)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_800_000)
  qrImage?: string;

  @IsOptional()
  @IsIn(["transaction_id"])
  verifyBy?: string;

  @IsOptional()
  @IsBoolean()
  askPayerNumber?: boolean;

  @IsOptional()
  @IsBoolean()
  checkBalance?: boolean;

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
  @MaxLength(2000)
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
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  ids!: string[];
}

export class ApproveDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  providerRef?: string;
}

export class EditCheckoutDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  reference!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(250000)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  payerAccount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  providerRef?: string;
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
  @MaxLength(80)
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
  @MaxLength(400_000)
  receipt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}

export class InvoiceLineDto {
  @IsString()
  @MaxLength(160)
  description!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100000)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(250000)
  price!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(250000)
  discount!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  vat!: number;
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

  @IsOptional()
  @IsString()
  @MaxLength(10)
  dueOn?: string;

  @IsOptional()
  @IsIn(["BDT", "USD", "EUR", "GBP"])
  currency?: string;

  @IsOptional()
  @IsIn(["due", "paid", "cancelled"])
  status?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  items?: InvoiceLineDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(250000)
  shipping?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(250000)
  vatTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(250000)
  discountTotal?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  redirectUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  privateNote?: string;
}

export class BillUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(250000)
  total?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  dueOn?: string;

  @IsOptional()
  @IsIn(["BDT", "USD", "EUR", "GBP"])
  currency?: string;

  @IsOptional()
  @IsIn(["due", "paid", "cancelled"])
  status?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  items?: InvoiceLineDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(250000)
  shipping?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(250000)
  vatTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(250000)
  discountTotal?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  redirectUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  privateNote?: string;
}

export class LinkFieldDto {
  @IsString()
  @MaxLength(80)
  label!: string;

  @IsIn(["text", "email", "phone", "number", "textarea"])
  type!: string;

  @IsBoolean()
  required!: boolean;
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

  @IsOptional()
  @IsIn(["BDT", "USD", "EUR", "GBP"])
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  expireOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  redirectUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180000)
  image?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => LinkFieldDto)
  fields?: LinkFieldDto[];
}

export class LinkUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  detail?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(250000)
  amount?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  slug?: string;

  @IsOptional()
  @IsIn(["BDT", "USD", "EUR", "GBP"])
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  expireOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  redirectUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180000)
  image?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => LinkFieldDto)
  fields?: LinkFieldDto[];
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

const keyAbilities = [
  "payment:checkout",
  "payment:verify",
  "payment:refund",
  "sms:sync",
  "sms:receive",
  "sms:send",
] as const;

export class KeyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;

  @IsIn(["checkout", "sms"])
  keyType!: "checkout" | "sms";

  @IsIn(["auto", "custom"])
  generation!: "auto" | "custom";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  secret?: string;

  @IsArray()
  @IsIn(keyAbilities, { each: true })
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

export class KeyUpdateDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsIn(["checkout", "sms"])
  keyType?: "checkout" | "sms";

  @IsOptional()
  @IsArray()
  @IsIn(keyAbilities, { each: true })
  abilities?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  secret?: string;

  @IsOptional()
  @IsBoolean()
  generate?: boolean;
}

export class UddoktaCheckoutDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  full_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(250000)
  amount!: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  redirect_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  cancel_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  webhook_url?: string;
}

export class UddoktaVerifyDto {
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  invoice_id!: string;
}

export class LinkAnswerDto {
  @IsString()
  @MaxLength(80)
  label!: string;

  @IsString()
  @MaxLength(200)
  value!: string;
}

export class StartLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => LinkAnswerDto)
  answers?: LinkAnswerDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}

export class HandsetDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  simSlot?: number;

  @IsOptional()
  @IsBoolean()
  sendsSms?: boolean;
}

export class PublicSmsDto {
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(320)
  message!: string;
}

export class QueueSmsDto {
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  handsetId!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(20)
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(320)
  body!: string;
}

export class JobsQueryDto {
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  uid!: string;
}

export class BalanceCheckDto {
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  uid!: string;

  @IsBoolean()
  on!: boolean;
}

export class BalanceWriteDto {
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  uid!: string;

  @IsIn(["bkash", "nagad", "rocket", "upay"])
  service!: "bkash" | "nagad" | "rocket" | "upay";

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  balanceCents!: number;

  @IsIn(["initial", "manual"])
  kind!: "initial" | "manual";
}

export class BalanceDecisionDto {
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  uid!: string;

  @IsIn(["verified", "rejected"])
  decision!: "verified" | "rejected";

  @IsIn(["bkash", "nagad", "rocket", "upay"])
  service!: "bkash" | "nagad" | "rocket" | "upay";

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  trxId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountCents!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  balanceCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  note?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  smsKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  smsSender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  smsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  smsBody?: string;
}

export class JobResultDto {
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  uid!: string;

  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  error?: string;
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
  @MaxLength(80)
  sender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receivedKey?: string;
}

export class NoticeItemDto {
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receivedKey?: string;
}

export class OfficialGatewayDto {
  @IsIn(["bkash", "nagad", "rocket", "upay", "banglaqr", "bank"])
  provider!: "bkash" | "nagad" | "rocket" | "upay" | "banglaqr" | "bank";

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsIn(["sandbox", "live"])
  mode?: "sandbox" | "live";

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  appKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  appSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  merchantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  merchantNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  publicKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  privateKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  minAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  maxAmount?: string;
}

export class NoticeBatchDto {
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  uid!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => NoticeItemDto)
  messages!: NoticeItemDto[];
}
