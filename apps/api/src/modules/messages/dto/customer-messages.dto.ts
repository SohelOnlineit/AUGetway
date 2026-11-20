import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const SHOPS = ["amarpin", "uniqbd"] as const;

export class CustomerMessagesQueryDto {
  @IsOptional()
  @IsIn(SHOPS)
  shop?: "amarpin" | "uniqbd";

  @IsOptional()
  @IsString()
  @MaxLength(40)
  productId?: string;
}

export class SendCustomerSmsDto {
  @IsIn(SHOPS)
  shop!: "amarpin" | "uniqbd";

  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  productId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(640)
  message!: string;
}

export class BulkCustomerSmsDto {
  @IsIn(SHOPS)
  shop!: "amarpin" | "uniqbd";

  @IsOptional()
  @IsString()
  @MaxLength(40)
  productId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(640)
  message!: string;
}

export class SendCustomerEmailDto {
  @IsIn(SHOPS)
  shop!: "amarpin" | "uniqbd";

  @IsString()
  @MaxLength(120)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  productId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(140)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}

export class BulkCustomerEmailDto {
  @IsIn(SHOPS)
  shop!: "amarpin" | "uniqbd";

  @IsOptional()
  @IsString()
  @MaxLength(40)
  productId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(140)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}
