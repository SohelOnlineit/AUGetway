import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import {
  TicketPriority,
  TicketStatus,
} from "../../../generated/prisma/client";
import { AdminPaginationQuery } from "../../admin/dto/admin-common.dto";

export class AdminTicketListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;
}

export class AdminTicketUpdateDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedToUserId?: string | null;

  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;
}

export class TicketStatusActionDto {
  @IsIn(["close", "reopen"])
  action!: "close" | "reopen";

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(1000)
  reason?: string;
}
