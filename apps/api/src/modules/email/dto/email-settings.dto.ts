import { Type } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { EMAIL_CHANNELS, type EmailChannelId } from "../../../shared/mail/email-settings.service";

export class UpdateEmailSettingsDto {
  @IsIn(["amarpin", "uniqbd"])
  shop!: "amarpin" | "uniqbd";

  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  mockMode!: boolean;

  @IsBoolean()
  customerOrderEmails!: boolean;

  @IsBoolean()
  adminOrderAlerts!: boolean;

  @IsString()
  @MaxLength(200)
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsBoolean()
  secure!: boolean;

  @IsIn(EMAIL_CHANNELS)
  channel!: EmailChannelId;

  @IsString()
  @MaxLength(80)
  fromName!: string;

  @IsString()
  @MaxLength(200)
  fromEmail!: string;

  @IsString()
  @MaxLength(200)
  smtpUser!: string;

  @IsString()
  @MaxLength(200)
  replyTo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  smtpPass?: string;
}

export class EmailChannelDto {
  @IsIn(["amarpin", "uniqbd"])
  shop!: "amarpin" | "uniqbd";

  @IsIn(EMAIL_CHANNELS)
  channel!: EmailChannelId;
}

export class SendTestEmailDto extends EmailChannelDto {
  @IsEmail()
  @MinLength(3)
  @MaxLength(200)
  to!: string;
}
