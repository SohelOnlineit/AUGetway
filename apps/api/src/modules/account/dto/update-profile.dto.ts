import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export enum ThemePreferenceDto {
  SYSTEM = "SYSTEM",
  LIGHT = "LIGHT",
  DARK = "DARK",
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[0-9+\-\s()]*$/, {
    message: "phone may only contain digits and + - ( ) spaces",
  })
  phone?: string;

  @IsOptional()
  @IsEnum(ThemePreferenceDto)
  theme?: ThemePreferenceDto;
}
