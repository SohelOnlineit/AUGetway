import { IsIn, IsString, MaxLength } from "class-validator";

const SHOPS = ["amarpin", "uniqbd"] as const;

export class UpdateContactDetailsDto {
  @IsIn(SHOPS)
  shop!: "amarpin" | "uniqbd";

  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @MaxLength(300)
  address!: string;

  @IsString()
  @MaxLength(200)
  whatsapp!: string;
}
