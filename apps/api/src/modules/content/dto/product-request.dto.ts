import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { AdminPaginationQuery } from "../../admin/dto/admin-common.dto";

export enum ProductRequestStatusDto {
  NEW = "NEW",
  REVIEWING = "REVIEWING",
  REPLIED = "REPLIED",
  CLOSED = "CLOSED",
}

export class CreateProductRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  productName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  customerName!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  mobile!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  details!: string;
}

export class AdminProductRequestListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsEnum(ProductRequestStatusDto)
  status?: ProductRequestStatusDto;
}

export class AdminProductRequestUpdateDto {
  @IsOptional()
  @IsEnum(ProductRequestStatusDto)
  status?: ProductRequestStatusDto;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  adminReply?: string | null;

  /** When true, attempt email delivery of adminReply (never fake ACCEPTED). */
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
