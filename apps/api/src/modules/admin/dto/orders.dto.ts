import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from "class-validator";
import { OrderStatus } from "../../../generated/prisma/client";
import { AdminPaginationQuery } from "./admin-common.dto";

export class AdminOrderListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  origin?: string;

  @IsOptional()
  @IsIn(["trash"])
  view?: "trash";
}

export class SelectedInventoryItemDto {
  @IsString()
  @MaxLength(40)
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  packageValueId?: string;
}

export class AdminOrderActionDto {
  @IsIn(["CANCEL_PENDING", "MARK_COMPLETE", "SET_STATUS", "MOVE_TO_TRASH", "RESTORE"])
  action!: "CANCEL_PENDING" | "MARK_COMPLETE" | "SET_STATUS" | "MOVE_TO_TRASH" | "RESTORE";

  @ValidateIf((dto: AdminOrderActionDto) => dto.action === "SET_STATUS")
  @IsIn(["PENDING_PAYMENT", "PAID", "FULFILLED", "CANCELLED", "REFUNDED"])
  status?: "PENDING_PAYMENT" | "PAID" | "FULFILLED" | "CANCELLED" | "REFUNDED";

  /** Units the admin added on this order. Sold only when the order is complete. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SelectedInventoryItemDto)
  inventoryItems?: SelectedInventoryItemDto[];
}

export class AdminOrderCustomerNoteDto {
  @IsString()
  @MaxLength(40)
  senderType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}

export class UpdateDeliveryCodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  code!: string;
}

export class AdminOrderCustomerInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(11)
  index!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  value!: string;
}
