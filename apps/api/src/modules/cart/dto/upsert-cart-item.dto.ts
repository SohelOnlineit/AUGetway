import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CartCustomerAnswerDto {
  @IsString()
  @MaxLength(40)
  id!: string;

  @IsString()
  @MaxLength(500)
  value!: string;
}

export class UpsertCartItemDto {
  @IsString()
  @MinLength(8)
  productId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  packageValueId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  /** Answers for the product's "Your information" boxes, keyed by field id. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => CartCustomerAnswerDto)
  customerInputs?: CartCustomerAnswerDto[];
}
