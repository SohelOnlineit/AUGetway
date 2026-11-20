import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { AccessBlockType } from "../../../shared/security/access-block.service";

export class CreateAccessBlockDto {
  @IsIn(["ip", "country"])
  type!: AccessBlockType;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
