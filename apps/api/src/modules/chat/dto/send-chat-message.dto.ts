import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

/** Public path produced by the chat photo upload. */
export const CHAT_IMAGE_PATH = /^\/api\/content\/media\/[a-f0-9]{32}\.(webp|svg)$/i;

export class SendChatMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsString()
  @Matches(CHAT_IMAGE_PATH)
  imageUrl?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;
}
