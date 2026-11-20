import { IsEnum, IsOptional } from "class-validator";
import { PaymentIntentStatus } from "../../../generated/prisma/client";
import { AdminPaginationQuery } from "../../admin/dto/admin-common.dto";

export class AdminPaymentListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsEnum(PaymentIntentStatus)
  status?: PaymentIntentStatus;
}
