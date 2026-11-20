import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Put,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ShopperGuard } from "../storefront/shopper.guard";
import { CartService } from "./cart.service";
import { UpdateCartItemDto } from "./dto/update-cart-item.dto";
import { UpsertCartItemDto } from "./dto/upsert-cart-item.dto";

@Controller("cart")
@UseGuards(ShopperGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  getCart(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.cart.getCart(user.id, storefront);
  }

  @Put("items")
  upsertItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertCartItemDto,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.cart.upsertItem(user.id, dto, storefront);
  }

  @Patch("items/:itemId")
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateCartItemDto,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.cart.updateItem(user.id, itemId, dto.quantity, storefront);
  }

  @Delete("items/:itemId")
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("itemId") itemId: string,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.cart.removeItem(user.id, itemId, storefront);
  }
}
