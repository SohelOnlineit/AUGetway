import { Module } from "@nestjs/common";
import { PromotionsModule } from "../promotions/promotions.module";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [PromotionsModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
