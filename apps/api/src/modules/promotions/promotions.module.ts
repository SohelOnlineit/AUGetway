import { Module } from "@nestjs/common";
import { CouponsService } from "./coupons.service";
import { ReviewsService } from "./reviews.service";

@Module({
  providers: [CouponsService, ReviewsService],
  exports: [CouponsService, ReviewsService],
})
export class PromotionsModule {}
