import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateTicketDto {
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  body!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;
}
