import { IsOptional, IsString, MinLength } from "class-validator";

export class RefreshTokenDto {
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}

/** Logout accepts a missing/empty token and still returns success. */
export class LogoutDto {
  @IsOptional()
  @IsString()
  @MinLength(20)
  refreshToken?: string;
}
