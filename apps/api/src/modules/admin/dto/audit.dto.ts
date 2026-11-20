import { IsOptional, IsString, MaxLength } from "class-validator";
import { AdminPaginationQuery } from "./admin-common.dto";

export class AdminAuditListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsString()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;
}
