import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class AdminPaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class AdminIdParam {
  @IsString()
  @MinLength(8)
  id!: string;
}
