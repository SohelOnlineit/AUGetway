import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { AdminPaginationQuery } from "../../admin/dto/admin-common.dto";

export enum ContactInquiryStatusDto {
  NEW = "NEW",
  READ = "READ",
  REPLIED = "REPLIED",
  CLOSED = "CLOSED",
}

export class CreateContactInquiryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;
}

export class AdminContactListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsEnum(ContactInquiryStatusDto)
  status?: ContactInquiryStatusDto;
}

export class AdminContactUpdateDto {
  @IsOptional()
  @IsEnum(ContactInquiryStatusDto)
  status?: ContactInquiryStatusDto;
}

export class AdminContactReplyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  body!: string;
}
