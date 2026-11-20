import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class StorefrontBrandDto {
  @IsIn(["amarpin", "uniqbd"])
  id!: "amarpin" | "uniqbd";

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  siteName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  logoAlt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lightLogoPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  darkLogoPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  faviconPath?: string | null;
}

export class UpdateAdminAppearanceDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => StorefrontBrandDto)
  brands!: StorefrontBrandDto[];
}
