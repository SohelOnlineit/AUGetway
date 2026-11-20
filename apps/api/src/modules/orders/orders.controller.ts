import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { randomUUID } from "node:crypto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ShopperGuard } from "../storefront/shopper.guard";
import { CheckoutDto } from "./dto/checkout.dto";
import { QuoteCouponDto } from "../promotions/dto/coupon.dto";
import { storefrontFromHeaders } from "../catalog/storefronts";
import { OrdersService } from "./orders.service";

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get("orders")
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.listForUser(user.id);
  }

  @Get("orders/:id")
  @UseGuards(ShopperGuard)
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.orders.getForUser(user.id, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("checkout")
  @UseGuards(ShopperGuard)
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutDto,
    @Headers("idempotency-key") idempotencyHeader?: string,
    @Req() req?: Request,
  ) {
    const idempotencyKey =
      idempotencyHeader?.trim() ||
      dto.idempotencyKey?.trim() ||
      randomUUID();
    return this.orders.checkout(
      user.id,
      idempotencyKey,
      dto.couponCode,
      dto.paymentMethod,
      dto.originSource,
      {
        isGuest: user.isGuest === true,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
      },
      storefrontFromHeaders(req?.headers ?? {}),
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("checkout/coupon-quote")
  @UseGuards(ShopperGuard)
  quoteCoupon(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: QuoteCouponDto,
  ) {
    return this.orders.quoteCoupon(user.id, dto.code);
  }
}
