import { IsEnum, IsOptional, IsString } from "class-validator";
import { RefundStatus } from "../../../generated/prisma/client";
import { AdminPaginationQuery } from "../../admin/dto/admin-common.dto";

export class AdminRefundListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsEnum(RefundStatus)
  status?: RefundStatus;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;
}
