import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class UploadImageDto {
  /** Raw base64 (no data: URL prefix required, but accepted). */
  @IsString()
  @MinLength(32)
  @MaxLength(15_000_000)
  dataBase64!: string;

  @IsString()
  @IsIn([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
    "image/bmp",
    "image/tiff",
    "image/tif",
    "image/svg+xml",
    "image/svg",
    "image/x-icon",
    "image/vnd.microsoft.icon",
  ])
  contentType!: string;
}
