import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const SHOPS = ["amarpin", "uniqbd"] as const;

export class UpdateTelegramDto {
  @IsIn(SHOPS)
  shop!: "amarpin" | "uniqbd";

  @IsBoolean()
  orderAlerts!: boolean;

  @IsBoolean()
  messageAlerts!: boolean;

  @IsString()
  @MaxLength(64)
  chatId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  botToken?: string;
}

export class TelegramShopDto {
  @IsIn(SHOPS)
  shop!: "amarpin" | "uniqbd";
}
