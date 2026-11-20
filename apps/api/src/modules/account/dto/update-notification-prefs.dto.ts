import { IsBoolean, IsOptional } from "class-validator";

export class UpdateNotificationPrefsDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;
}
