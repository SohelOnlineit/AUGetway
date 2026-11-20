import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from "class-validator";

export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  code?: string;

  /** Required together with `code`, so a short code is only ever checked against one account. */
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
