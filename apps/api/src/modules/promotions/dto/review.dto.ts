import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { AdminPaginationQuery } from "../../admin/dto/admin-common.dto";

export class PublicReviewFeedQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  product?: string;
}

export class UpsertReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  body!: string;
}

export enum ReviewStatusDto {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export class AdminReviewListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsEnum(ReviewStatusDto)
  status?: ReviewStatusDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}

export class ModerateReviewDto {
  @IsEnum(ReviewStatusDto)
  status!: ReviewStatusDto;
}
