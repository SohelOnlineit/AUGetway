import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AdminPaginationQuery } from "./admin-common.dto";

const CUSTOMER_STATUSES = ["PENDING", "ACTIVE", "SUSPENDED"] as const;
const CUSTOMER_ROLES = ["CUSTOMER", "VIP", "RESELLER", "AFFILIATE", "SUPPLIER", "EDITOR", "ADMINISTRATOR"] as const;

export class AdminCustomerListQuery extends AdminPaginationQuery {}

export class UpdateAdminCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string | null;

  @IsOptional()
  @IsIn(CUSTOMER_STATUSES)
  status?: (typeof CUSTOMER_STATUSES)[number];

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(CUSTOMER_ROLES, { each: true })
  roles?: Array<(typeof CUSTOMER_ROLES)[number]>;

  /** Blank leaves the stored phone unchanged. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;
}

export class CreateAdminCustomerDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}

export class CreateAdminStaffDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}

export class UpdateAdminCustomerNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string | null;
}
