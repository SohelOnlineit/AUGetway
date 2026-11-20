import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ReviewsService } from "../promotions/reviews.service";
import { UpsertReviewDto } from "../promotions/dto/review.dto";
import { AccountService } from "./account.service";
import { AddWishlistItemDto } from "./dto/add-wishlist-item.dto";
import { UpdateNotificationPrefsDto } from "./dto/update-notification-prefs.dto";
import { ChangeEmailDto } from "./dto/change-email.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UploadImageDto } from "../content/dto/upload.dto";

@Controller("account")
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get("overview")
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.account.getOverview(user.id);
  }

  @Get("profile")
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.account.getProfile(user.id);
  }

  @Post("profile/photo")
  async uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadImageDto,
  ) {
    const raw = dto.dataBase64.includes(",") ? dto.dataBase64.split(",")[1]! : dto.dataBase64;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, "base64");
    } catch {
      throw new BadRequestException("Invalid photo");
    }
    return this.account.setAvatar(user.id, buffer, dto.contentType);
  }

  @Patch("profile")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.account.updateProfile(user.id, dto);
  }

  @Patch("password")
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.account.changePassword(user.id, dto);
  }

  @Patch("email")
  changeEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeEmailDto,
  ) {
    return this.account.changeEmail(user.id, dto);
  }

  @Get("wishlist")
  wishlist(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.account.listWishlist(user.id, storefront);
  }

  @Post("wishlist")
  addWishlist(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddWishlistItemDto,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.account.addWishlistItem(user.id, dto.productId, storefront);
  }

  @Delete("wishlist/:itemId")
  removeWishlist(
    @CurrentUser() user: AuthenticatedUser,
    @Param("itemId") itemId: string,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.account.removeWishlistItem(user.id, itemId, storefront);
  }

  @Get("notifications")
  notifications(@CurrentUser() user: AuthenticatedUser) {
    return this.account.listNotifications(user.id);
  }

  @Post("notifications/read-all")
  readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.account.markAllNotificationsRead(user.id);
  }

  @Patch("notifications/:id/read")
  readOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.account.markNotificationRead(user.id, id);
  }

  @Get("reviews")
  myReviews(@CurrentUser() user: AuthenticatedUser) {
    return this.reviews.listMine(user.id);
  }

  @Post("reviews/:productId")
  upsertReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("productId") productId: string,
    @Body() dto: UpsertReviewDto,
  ) {
    return this.reviews.upsertMine(user.id, productId, dto);
  }

  @Get("notification-preferences")
  getPrefs(@CurrentUser() user: AuthenticatedUser) {
    return this.account.getNotificationPrefs(user.id);
  }

  @Patch("notification-preferences")
  updatePrefs(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPrefsDto,
  ) {
    return this.account.updateNotificationPrefs(user.id, dto);
  }
}
