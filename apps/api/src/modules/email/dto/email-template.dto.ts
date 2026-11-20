import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateEmailTemplateDto {
  @IsIn(["amarpin", "uniqbd"])
  shop!: "amarpin" | "uniqbd";

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  heading?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  bodyText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  buttonLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  buttonUrl?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
