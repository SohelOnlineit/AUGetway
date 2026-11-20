import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { SmsProviderId } from "../sms.defaults";

const PROVIDERS: SmsProviderId[] = ["sms.net.bd", "bulksmsbd", "greenweb", "mimsms", "uniqbd", "custom"];
const SHOPS = ["amarpin", "uniqbd"] as const;

export class UpdateSmsGatewayDto {
  @IsIn(SHOPS)
  shop!: "amarpin" | "uniqbd";

  @IsBoolean()
  enabled!: boolean;

  @IsIn(PROVIDERS)
  provider!: SmsProviderId;

  @IsString()
  @MaxLength(20)
  senderId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;
}

export class SmsShopDto {
  @IsIn(SHOPS)
  shop!: "amarpin" | "uniqbd";
}

export class TestSmsDto extends SmsShopDto {
  @IsString()
  @MinLength(11)
  @MaxLength(14)
  phone!: string;
}

export class UpsertSmsTemplateDto extends SmsShopDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(480)
  body!: string;

  @IsBoolean()
  enabled!: boolean;
}
