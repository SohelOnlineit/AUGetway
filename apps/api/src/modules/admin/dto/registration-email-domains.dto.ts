import { IsArray, IsString } from "class-validator";

export class RegistrationEmailDomainsBodyDto {
  @IsArray()
  @IsString({ each: true })
  allow!: string[];

  @IsArray()
  @IsString({ each: true })
  block!: string[];
}
