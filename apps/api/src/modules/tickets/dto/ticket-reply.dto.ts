import { IsString, MaxLength, MinLength } from "class-validator";

export class TicketReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;
}
