import { IsString, MinLength } from "class-validator";

export class AddWishlistItemDto {
  @IsString()
  @MinLength(8)
  productId!: string;
}
