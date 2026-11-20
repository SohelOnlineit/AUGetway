import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { AdminPaginationQuery } from "./admin-common.dto";

export class AdminWalletListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsIn(["with", "zero", "all"])
  balance?: "with" | "zero" | "all" = "with";
}

export class AdminWalletAdjustDto {
  @IsIn(["CREDIT", "DEBIT"])
  type!: "CREDIT" | "DEBIT";

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountMinor!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}
