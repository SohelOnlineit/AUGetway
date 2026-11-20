import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { InventoryStatus } from "../../../generated/prisma/client";
import { AdminPaginationQuery } from "./admin-common.dto";

export class AdminInventoryListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  packageValueId?: string;
}

export class AddInventoryCodesDto {
  @IsString()
  @MinLength(8)
  productId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  packageValueId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MinLength(4, { each: true })
  @MaxLength(500, { each: true })
  codes!: string[];
}

export class AddManualInventoryCodeDto {
  @IsString()
  @MinLength(8)
  productId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  packageValueId?: string;

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  code!: string;
}

export class UpdateInventoryUnitStatusDto {
  @IsIn(["AVAILABLE", "DISABLED"])
  status!: "AVAILABLE" | "DISABLED";
}
